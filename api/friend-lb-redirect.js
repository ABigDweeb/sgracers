export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({
                error: 'Method not allowed'
            });
        }

        const {
            category,
            difficulty
        } = req.body || {};

        if (!category || !difficulty) {
            return res.status(400).json({
                error: 'Missing category or difficulty'
            });
        }

        const leaderboardUrl = new URL(
            `/api/generate-leaderboard?map=${encodeURIComponent(category)}&difficulty=${encodeURIComponent(difficulty)}&length=all`,
            `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`
        );

        const leaderboardResponse = await fetch(leaderboardUrl.href);
        if (!leaderboardResponse.ok) {
            return res.status(404).json({
                error: 'Leaderboard not found',
                path: leaderboardUrl.pathname,
            });
        }

        const leaderboardData = await leaderboardResponse.json();

        const formattedData = leaderboardData.map((entry) => ({
            compositeUserId: {
                friendId: "6f8a00c365494faab7893d0610a4f7c7",
                platform: entry.compositeUserId?.platform,
                platformId: entry.compositeUserId?.platformId,
            },
            value: entry.value,
            displayName: entry.displayName,
        }));

        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json(formattedData);

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
}