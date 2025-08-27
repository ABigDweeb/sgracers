const fs = require('fs');
const path = require('path');

function parseTimeToMs(timeString) {
    if (typeof timeString === 'number') return timeString;
    if (!timeString) return 0;

    if (timeString.includes(':')) {
        const [minutesPart, rest] = timeString.split(':');
        const [secondsPart, millisecondsPart = '0'] = rest.split('.');
        return (parseInt(minutesPart) * 60000) +
            (parseInt(secondsPart) * 1000) +
            parseInt(millisecondsPart.padEnd(3, '0'));
    } else {
        const [secondsPart, millisecondsPart = '0'] = timeString.split('.');
        return (parseInt(secondsPart) * 1000) + parseInt(millisecondsPart.padEnd(3, '0'));
    }
}

function toTitleCase(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

async function generateLeaderboard(map, difficulty, length) {
    try {
        if (!map || !difficulty) {
            throw new Error('Map and difficulty parameters are required');
        }

        const normalizedMap = toTitleCase(map);
        const normalizedDifficulty = toTitleCase(difficulty);

        const pbsDir = path.join(process.cwd(), 'pbs');
        const files = fs.readdirSync(pbsDir);

        const leaderboardEntries = [];

        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            try {
                const filePath = path.join(pbsDir, file);
                const data = fs.readFileSync(filePath, 'utf8');
                const userData = JSON.parse(data);

                if (userData.bestTimes) {
                    const mapKey = Object.keys(userData.bestTimes).find(
                        key => key.toLowerCase() === normalizedMap.toLowerCase()
                    );

                    if (mapKey && userData.bestTimes[mapKey]) {
                        const difficultyKey = Object.keys(userData.bestTimes[mapKey]).find(
                            key => key.toLowerCase() === normalizedDifficulty.toLowerCase()
                        );

                        if (difficultyKey && userData.bestTimes[mapKey][difficultyKey]) {
                            const time = userData.bestTimes[mapKey][difficultyKey];

                            leaderboardEntries.push({
                                compositeUserId: {
                                    platformId: userData.userId,
                                    platform: userData.platform
                                },
                                value: time,
                                displayName: userData.displayName
                            });
                        }
                    }
                }
            } catch (err) {
                console.error(`Error processing file ${file}:`, err.message);
            }
        }

        leaderboardEntries.sort((a, b) => parseTimeToMs(a.value) - parseTimeToMs(b.value));

        if (length === 0 || (typeof length === 'string' && length.toLowerCase() === 'all')) {
            return leaderboardEntries;
        }

        const leaderboardLength = parseInt(length, 10);
        return leaderboardEntries.slice(0, leaderboardLength);
    } catch (error) {
        console.error('Error generating leaderboard:', error.message);
        throw error;
    }
}

async function generateLeaderboards(leaderboards) {
    try {
        if (!Array.isArray(leaderboards) || leaderboards.length === 0) {
            throw new Error('leaderboards parameter must be a non-empty array');
        }

        const results = {};

        for (const combo of leaderboards) {
            let {
                map,
                difficulty,
                length
            } = combo;

            if (!map || !difficulty) {
                console.warn(`Skipping invalid combination: ${JSON.stringify(combo)}`);
                continue;
            }

            if (length === undefined || length === null) {
                length = 10;
            }

            try {
                const leaderboard = await generateLeaderboard(map, difficulty, length);
                
                if (!results[map]) {
                    results[map] = {};
                }
                
                results[map][difficulty] = leaderboard;
            } catch (err) {
                console.error(`Error generating leaderboard for ${map}-${difficulty}:`, err.message);
                
                if (!results[map]) {
                    results[map] = {};
                }
                
                results[map][difficulty] = {
                    error: err.message
                };
            }
        }

        return results;
    } catch (error) {
        console.error('Error generating multiple leaderboards:', error.message);
        throw error;
    }
}

module.exports = {
    generateLeaderboard,
    generateLeaderboards,
    default: async (req, res) => {
        try {
            let {
                map,
                difficulty,
                length,
                category,
                leaderboards
            } = req.method === 'GET' ? req.query : req.body;

            if (length === undefined || length === null || length === '' || length === 'undefined') {
                length = 10;
            } else if (typeof length === 'string' && length.toLowerCase() === 'all') {
                length = 'all';
            } else {
                length = parseInt(length, 10);
                if (isNaN(length) || length <= 0) length = 10;
            }

            if (leaderboards) {
                if (typeof leaderboards === 'string') {
                    try {
                        leaderboards = JSON.parse(leaderboards);
                    } catch (e) {
                        console.error('Error parsing leaderboards:', e.message);
                        leaderboards = null;
                    }
                }
            }

            if (leaderboards) {
                const returnedLeaderboards = await generateLeaderboards(leaderboards);
                res.setHeader('Content-Type', 'application/json');
                res.status(200).json(returnedLeaderboards);
                return;
            }

            if (category) {
                length = 10;
                if (category.includes('-')) {
                    const parts = category.split('-');
                    map = parts[0];
                    difficulty = parts[1];
                } else {
                    map = category;
                    if (!difficulty) difficulty = 'Medium';
                }
            }

            if (!map || !difficulty) {
                res.status(400).json({
                    error: 'Missing required parameters. Need either map + difficulty, category, or leaderboards array'
                });
                return;
            }

            const leaderboard = await generateLeaderboard(map, difficulty, length);
            res.setHeader('Content-Type', 'application/json');
            res.status(200).json(leaderboard);
        } catch (err) {
            console.error('API Error:', err.message);
            res.status(500).json({
                error: err.message
            });
        }
    }
};