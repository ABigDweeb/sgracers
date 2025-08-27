export default async function handler(req, res) {
    try {
        const {
            type,
            category
        } = req.query;

        if (type !== 'RACE' || !category) {
            return res.status(400).json({
                error: 'Invalid parameters'
            });
        }

        const leaderboardUrl = new URL(
            `/api/generate-leaderboard?category=${encodeURIComponent(category)}&length=all`,
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