const {
    generateLeaderboard,
    generateLeaderboards
} = require('./generate-leaderboard');

async function getUserLBData({
    displayName,
    platformId,
    leaderboards
}) {
    const normalizedLeaderboards = leaderboards.map(lb => ({
        ...lb,
        length: 'all'
    }));

    const requestedLeaderboards = await generateLeaderboards(normalizedLeaderboards);
    const flatResults = {};

    let resolvedDisplayName = displayName || null;
    let resolvedPlatformId = platformId || null;

    for (const [mapName, difficulties] of Object.entries(requestedLeaderboards)) {
        for (const [difficulty, leaderboard] of Object.entries(difficulties)) {
            const key = `${mapName}-${difficulty}`;
            
            if (!Array.isArray(leaderboard)) {
                flatResults[key] = leaderboard;
                continue;
            }

            const idx = leaderboard.findIndex(entry =>
                displayName ?
                entry.displayName?.toLowerCase() === displayName.toLowerCase() :
                entry.compositeUserId.platformId === platformId
            );

            if (idx !== -1) {
                if (!resolvedDisplayName) resolvedDisplayName = leaderboard[idx].displayName || null;
                if (!resolvedPlatformId) resolvedPlatformId = leaderboard[idx].compositeUserId?.platformId || null;

                flatResults[key] = {
                    position: idx + 1,
                    totalPlayers: leaderboard.length,
                    time: leaderboard[idx].value
                };
            } else {
                flatResults[key] = {
                    position: null,
                    totalPlayers: leaderboard.length,
                    time: null
                };
            }
        }
    }

    const nestedResults = {
        platformId: resolvedPlatformId,
        displayName: resolvedDisplayName
    };

    for (const [key, data] of Object.entries(flatResults)) {
        const [mapKey, diffKey] = key.split('-');
        if (!nestedResults[mapKey]) nestedResults[mapKey] = {};
        nestedResults[mapKey][diffKey] = data;
    }

    return nestedResults;
}

module.exports = async (req, res) => {
    try {
        let displayName, platformId, leaderboards;

        if (req.method === "POST") {
            const body = req.body || {};
            displayName = body.displayName || null;
            platformId = body.platformId || null;
            leaderboards = body.leaderboards || null;
        } else {
            displayName = req.query.displayName || null;
            platformId = req.query.platformId || null;
            leaderboards = req.query.leaderboards ? JSON.parse(req.query.leaderboards) : null;
        }

        if (!displayName && !platformId) {
            return res.status(400).json({
                error: 'Either displayName or platformId is required.'
            });
        }

        if (!leaderboards) {
            return res.status(400).json({
                error: 'Missing leaderboards parameter. Provide as JSON body or query array: [{"map":"Impact","difficulty":"Hard"}]'
            });
        }

        const result = await getUserLBData({
            displayName,
            platformId,
            leaderboards
        });
        res.status(200).json(result);

    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: err.message
        });
    }
};