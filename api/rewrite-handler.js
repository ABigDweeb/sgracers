export default async (req, res) => {
  try {
    const { type, category } = req.query;

    if (type !== 'RACE' || !category) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const filename = `${category.replace(/-/g, '_')}.json`;
    
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'leaderboards', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        error: 'Leaderboard not found',
        details: `File not found at: ${filePath}`
      });
    }

    // Read file and remove BOM if present
    let data = fs.readFileSync(filePath, 'utf8');
    if (data.charCodeAt(0) === 0xFEFF) {
      data = data.slice(1); // Remove BOM
    }

    let leaderboardData;
    try {
      leaderboardData = JSON.parse(data);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('File content start:', data.substring(0, 100));
      return res.status(500).json({ 
        error: 'Invalid leaderboard data',
        message: parseError.message,
        details: 'The file might contain invalid JSON or special characters'
      });
    }

    // Get only the top 10 entries
    const top10 = Array.isArray(leaderboardData) 
      ? leaderboardData.slice(0, 10) 
      : leaderboardData;

    res.setHeader('Content-Type', 'application/json');
    return res.send(JSON.stringify(top10));
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
};