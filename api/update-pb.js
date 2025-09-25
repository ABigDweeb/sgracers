const {
    Octokit
} = require('@octokit/rest');

const STEAM_API_KEY = process.env.STEAM_API_KEY;

async function validateSteamAuthTicket(steamId, authTicket) {
    if (!authTicket) {
        console.log('No auth ticket provided');
        return false;
    }

    try {
        const response = await fetch(
            `https://api.steampowered.com/ISteamUserAuth/AuthenticateUserTicket/v1/?key=${STEAM_API_KEY}&appid=677620&ticket=${authTicket}`
        );
        
        if (!response.ok) {
            console.log(`Steam Auth API responded with status ${response.status}`);
            return false;
        }
        
        const data = await response.json();
        
        if (data.response && data.response.params) {
            const resultSteamId = data.response.params.steamid;
            if (resultSteamId === steamId) {
                console.log(`Successfully validated auth ticket for Steam ID ${steamId}`);
                return true;
            } else {
                console.error(`Auth ticket validation failed: expected ${steamId}, got ${resultSteamId}`);
                return false;
            }
        }
        
        if (data.response && data.response.error) {
            console.error(`Steam auth validation error: ${JSON.stringify(data.response.error)}`);
            return false;
        }
        
        console.warn('Invalid response format from Steam auth API');
        return false;
    } catch (error) {
        console.error('Steam Auth API error:', error.message);
        return false;
    }
}

async function getSteamUsername(steamId) {
    try {
        const response = await fetch(
            `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId}`
        );
        
        if (!response.ok) {
            throw new Error(`Steam API responded with status ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.response && data.response.players && data.response.players.length > 0) {
            return data.response.players[0].personaname;
        }
        
        return null;
    } catch (error) {
        console.error('Steam API error:', error.message);
        return null;
    }
}

function sortBestTimes(bestTimes) {
    const mapOrder = [
        "Abyss", "Atlantis", "Crag", "Foregone_Destruction", "Helix",
        "Highwind", "Impact", "Karman_Station", "Lavawell", "Oasis",
        "Olympus", "Pantheon", "Silo", "Stadium"
    ];

    const difficultyOrder = ["Easy", "Medium", "Hard"];

    const orderedMaps = Object.keys(bestTimes)
        .sort((a, b) => {
            const indexA = mapOrder.indexOf(a);
            const indexB = mapOrder.indexOf(b);

            if (indexA !== -1 && indexB !== -1) return indexA - indexB;

            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;

            const stadiumIndex = mapOrder.indexOf("Stadium");
            const aAfterStadium = mapOrder.includes(a) ? false : true;
            const bAfterStadium = mapOrder.includes(b) ? false : true;

            if (aAfterStadium && bAfterStadium) return a.localeCompare(b);
            if (aAfterStadium && !bAfterStadium) return 1;
            if (!aAfterStadium && bAfterStadium) return -1;

            return a.localeCompare(b);
        });

    const newBestTimes = {};
    for (const map of orderedMaps) {
        const difficulties = Object.keys(bestTimes[map]).sort((a, b) => {
            const dA = difficultyOrder.indexOf(a);
            const dB = difficultyOrder.indexOf(b);

            if (dA !== -1 && dB !== -1) return dA - dB;
            if (dA !== -1) return -1;
            if (dB !== -1) return 1;
            return a.localeCompare(b);
        });

        newBestTimes[map] = {};
        for (const diff of difficulties) {
            newBestTimes[map][diff] = bestTimes[map][diff];
        }
    }

    return newBestTimes;
}

function normalizeMapName(map) {
    if (!map) return null;
    const m = map.trim().toLowerCase();

    const mapping = {
        "clubsilo": "Silo",
        "club_silo": "Silo",
        "club silo": "Silo",
        "silo": "Silo",

        "foregone": "Foregone_Destruction",
        "foregone destruction": "Foregone_Destruction",
        "foregonedestruction": "Foregone_Destruction",
        "foregone_destruction": "Foregone_Destruction",

        "karman": "Karman_Station",
        "karman station": "Karman_Station",
        "karmanstation": "Karman_Station",
        "karman_station": "Karman_Station",

        "abyss": "Abyss",
        "atlantis": "Atlantis",
        "crag": "Crag",
        "helix": "Helix",
        "highwind": "Highwind",
        "impact": "Impact",
        "lavawell": "Lavawell",
        "oasis": "Oasis",
        "olympus": "Olympus",
        "pantheon": "Pantheon",
        "stadium": "Stadium"
    };

    return mapping[m] || capitalizeFirstLetter(m);
}

function normalizeDifficulty(diff) {
    if (!diff) return null;
    const d = diff.trim().toLowerCase();

    if (d === "easy") return "Easy";
    if (d === "medium") return "Medium";
    if (d === "hard") return "Hard";

    return capitalizeFirstLetter(d);
}

function capitalizeFirstLetter(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function normalizeRequestBody(body) {
    const normalized = {};
    const fieldMappings = {
        'difficulty': 'difficulty',
        'map': 'map',
        'platform': 'platform',
        'platformuserid': 'platformUserId',
        'platformUserId': 'platformUserId',
        'timems': 'timeMs',
        'timeMs': 'timeMs'
    };

    for (const [key, value] of Object.entries(body)) {
        const normalizedKey = fieldMappings[key.toLowerCase()];
        if (normalizedKey) {
            normalized[normalizedKey] = value;
        } else {
            normalized[key] = value;
        }
    }
    
    return normalized;
}

function extractAuthTicketFromHeader(authHeader) {
    if (!authHeader) return null;
    
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7).trim();
    }
    
    if (authHeader.startsWith('Token ')) {
        return authHeader.substring(6).trim();
    }
    
    return authHeader.trim();
}

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    let body;
    try {
        if (req.method === 'POST') {
            let data = '';
            req.on('data', chunk => data += chunk);
            body = await new Promise((resolve, reject) => {
                req.on('end', () => {
                    try {
                        resolve(data ? JSON.parse(data) : {});
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            body = normalizeRequestBody(body);
        } else {
            return res.status(405).json({
                error: 'Method not allowed'
            });
        }
    } catch (e) {
        return res.status(400).json({
            error: 'Invalid JSON',
            details: process.env.NODE_ENV === 'development' ? e.message : undefined
        });
    }

    let {
        platform,
        platformUserId,
        map,
        timeMs,
        difficulty
    } = body;

    map = normalizeMapName(map);
    difficulty = normalizeDifficulty(difficulty);

    if (!platform || !platformUserId || !map || timeMs == null || !difficulty) {
        return res.status(400).json({
            error: 'Missing required fields'
        });
    }

    let authTicket = null;
    if (platform.toLowerCase() === 'steam') {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        authTicket = extractAuthTicketFromHeader(authHeader);
        
        if (!authTicket) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Steam auth ticket required'
            });
        }

        const isValidAuth = await validateSteamAuthTicket(platformUserId, authTicket);
        if (!isValidAuth) {
            return res.status(401).json({
                error: 'Authentication failed',
                message: 'Invalid Steam authentication ticket'
            });
        }
    }

    const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN
    });

    try {
        const {
            data: {
                commit: {
                    sha: latestCommitSha
                }
            }
        } = await octokit.repos.getBranch({
            owner: process.env.GITHUB_REPO_OWNER,
            repo: process.env.GITHUB_REPO_NAME,
            branch: 'main'
        });

        let pbSha = null;
        let pbData = {
            userId: platformUserId,
            platform,
            displayName: platformUserId,
            bestTimes: {}
        };
        let pbFileExists = false;
        let displayNameUpdated = false;

        try {
            const {
                data
            } = await octokit.repos.getContent({
                owner: process.env.GITHUB_REPO_OWNER,
                repo: process.env.GITHUB_REPO_NAME,
                path: `pbs/${platformUserId}.json`,
                ref: 'main'
            });
            pbSha = data.sha;
            pbData = JSON.parse(Buffer.from(data.content, 'base64').toString());
            pbFileExists = true;
        } catch (error) {
            if (error.status !== 404) throw error;
        }

        if (platform.toLowerCase() === 'steam') {
            const steamUsername = await getSteamUsername(platformUserId);
            if (steamUsername && steamUsername !== pbData.displayName) {
                const oldName = pbData.displayName;
                pbData.displayName = steamUsername;
                displayNameUpdated = true;
                console.log(`Updated displayName from "${oldName}" to "${steamUsername}" for ${platformUserId}`);
            }
        }

        if (map && !pbData.bestTimes[map]) {
            pbData.bestTimes[map] = {};
        }

        if (map && difficulty && (pbData.bestTimes[map][difficulty] === undefined)) {
            pbData.bestTimes[map][difficulty] = null;
        }

        const currentPb = pbData.bestTimes?.[map]?.[difficulty];

        if (currentPb !== null && currentPb !== undefined && timeMs >= currentPb) {
            if (displayNameUpdated) {
                pbData.bestTimes = sortBestTimes(pbData.bestTimes);

                const {
                    data: pbBlob
                } = await octokit.git.createBlob({
                    owner: process.env.GITHUB_REPO_OWNER,
                    repo: process.env.GITHUB_REPO_NAME,
                    content: JSON.stringify(pbData, null, 2),
                    encoding: 'utf-8'
                });

                const {
                    data: newTree
                } = await octokit.git.createTree({
                    owner: process.env.GITHUB_REPO_OWNER,
                    repo: process.env.GITHUB_REPO_NAME,
                    base_tree: latestCommitSha,
                    tree: [{
                        path: `pbs/${platformUserId}.json`,
                        mode: '100644',
                        type: 'blob',
                        sha: pbBlob.sha
                    }]
                });

                const {
                    data: commit
                } = await octokit.git.createCommit({
                    owner: process.env.GITHUB_REPO_OWNER,
                    repo: process.env.GITHUB_REPO_NAME,
                    message: `${pbData.displayName} - Updated display name`,
                    tree: newTree.sha,
                    parents: [latestCommitSha]
                });

                await octokit.git.updateRef({
                    owner: process.env.GITHUB_REPO_OWNER,
                    repo: process.env.GITHUB_REPO_NAME,
                    ref: 'heads/main',
                    sha: commit.sha
                });
            }

            console.log(`Updated display name from ${pbData.displayName} to ${steamUsername}`);
            console.log(`Existing time ${currentPb} is faster than ${timeMs}`);

            return res.status(200).json({
                success: false,
                message: 'Existing time is faster',
                currentPb,
                submittedTime: timeMs,
                displayName: pbData.displayName,
                displayNameUpdated: displayNameUpdated
            });
        }

        pbData.bestTimes[map][difficulty] = timeMs;

        pbData.bestTimes = sortBestTimes(pbData.bestTimes);

        console.log(`${pbData.displayName} - ${(timeMs/1000).toFixed(3)}s ${map} ${difficulty}`);

        const {
            data: pbBlob
        } = await octokit.git.createBlob({
            owner: process.env.GITHUB_REPO_OWNER,
            repo: process.env.GITHUB_REPO_NAME,
            content: JSON.stringify(pbData, null, 2),
            encoding: 'utf-8'
        });

        const {
            data: newTree
        } = await octokit.git.createTree({
            owner: process.env.GITHUB_REPO_OWNER,
            repo: process.env.GITHUB_REPO_NAME,
            base_tree: latestCommitSha,
            tree: [{
                path: `pbs/${platformUserId}.json`,
                mode: '100644',
                type: 'blob',
                sha: pbBlob.sha
            }]
        });

        const {
            data: commit
        } = await octokit.git.createCommit({
            owner: process.env.GITHUB_REPO_OWNER,
            repo: process.env.GITHUB_REPO_NAME,
            message: `${pbData.displayName} - ${(timeMs/1000).toFixed(3)}s ${map} ${difficulty}`,
            tree: newTree.sha,
            parents: [latestCommitSha]
        });

        await octokit.git.updateRef({
            owner: process.env.GITHUB_REPO_OWNER,
            repo: process.env.GITHUB_REPO_NAME,
            ref: 'heads/main',
            sha: commit.sha
        });

        return res.status(200).json({
            success: true,
            message: currentPb == null ?
                'New personal best recorded!' :
                'Personal best updated!',
            oldTime: currentPb,
            newTime: timeMs,
            displayName: pbData.displayName,
            displayNameUpdated: displayNameUpdated,
            commitUrl: `https://github.com/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/commit/${commit.sha}`
        });

    } catch (error) {
        console.error('API Error:', error.message);
        return res.status(500).json({
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

