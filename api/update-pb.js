const { Octokit } = require('@octokit/rest');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // Parse body
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
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (e) {
    return res.status(400).json({ 
      error: 'Invalid JSON',
      details: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }

  // Validate fields
  const { platform, platformUserId, map, timeMs, difficulty } = body;
  if (!platform || !platformUserId || !map || timeMs === undefined || !difficulty) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  try {
    // Get current commit SHA
    const { data: { commit: { sha: latestCommitSha } } } = await octokit.repos.getBranch({
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      branch: 'main'
    });

    // Get current PB data
    let pbSha = null;
    let currentPb;
    try {
      const { data } = await octokit.repos.getContent({
        owner: process.env.GITHUB_REPO_OWNER,
        repo: process.env.GITHUB_REPO_NAME,
        path: `pbs/${platformUserId}.json`,
        ref: 'main'
      });
      pbSha = data.sha;
      const pbData = JSON.parse(Buffer.from(data.content, 'base64').toString());
      currentPb = pbData.bestTimes?.[map]?.[difficulty];
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    // Check if new record
    if (currentPb !== undefined && timeMs >= currentPb) {
      return res.status(200).json({
        success: false,
        message: 'Existing time is faster',
        currentPb,
        submittedTime: timeMs
      });
    }

    // Prepare updated PB
    const updatedPb = {
      userId: platformUserId,
      platform: platform,
      bestTimes: {
        ...(pbSha ? JSON.parse(Buffer.from((await octokit.repos.getContent({
          owner: process.env.GITHUB_REPO_OWNER,
          repo: process.env.GITHUB_REPO_NAME,
          path: `pbs/${platformUserId}.json`,
          ref: 'main'
        })).data.content, 'base64').toString()).bestTimes : {}),
        [map]: {
          ...(pbSha ? JSON.parse(Buffer.from((await octokit.repos.getContent({
            owner: process.env.GITHUB_REPO_OWNER,
            repo: process.env.GITHUB_REPO_NAME,
            path: `pbs/${platformUserId}.json`,
            ref: 'main'
          })).data.content, 'base64').toString()).bestTimes?.[map] : {}),
          [difficulty]: timeMs
        }
      }
    };

    // Prepare leaderboard update
    const leaderboardPath = `leaderboards/${map}_${difficulty}.json`;
    let leaderboardSha = null;
    let leaderboard = [];
    let existingDisplayName = null;

    try {
      const { data } = await octokit.repos.getContent({
        owner: process.env.GITHUB_REPO_OWNER,
        repo: process.env.GITHUB_REPO_NAME,
        path: leaderboardPath,
        ref: 'main'
      });
      leaderboardSha = data.sha;
      const content = Buffer.from(data.content, 'base64').toString();
      leaderboard = JSON.parse(content.replace(/^\uFEFF/, ''));
      
      const existingEntry = leaderboard.find(e => 
        e.compositeUserId.platformId === platformUserId
      );
      existingDisplayName = existingEntry?.displayName;
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    // Update leaderboard
    const updatedLeaderboard = leaderboard
      .filter(e => e.compositeUserId.platformId !== platformUserId)
      .concat({
        compositeUserId: {
          platformId: platformUserId,
          platform: platform
        },
        value: timeMs,
        displayName: existingDisplayName || `Player-${platformUserId.slice(-4)}`
      })
      .sort((a, b) => a.value - b.value);

    // Create blobs for both files
    const { data: pbBlob } = await octokit.git.createBlob({
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      content: JSON.stringify(updatedPb, null, 2),
      encoding: 'utf-8'
    });

    const { data: leaderboardBlob } = await octokit.git.createBlob({
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      content: JSON.stringify(updatedLeaderboard, null, 2),
      encoding: 'utf-8'
    });

    // Create new tree with both files
    const { data: newTree } = await octokit.git.createTree({
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      base_tree: latestCommitSha,
      tree: [
        {
          path: `pbs/${platformUserId}.json`,
          mode: '100644',
          type: 'blob',
          sha: pbBlob.sha
        },
        {
          path: leaderboardPath,
          mode: '100644',
          type: 'blob',
          sha: leaderboardBlob.sha
        }
      ]
    });

    // Create commit
    const { data: commit } = await octokit.git.createCommit({
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      message: `${existingDisplayName || `Player-${platformUserId.slice(-4)}`} - ${(timeMs/1000).toFixed(3)}s ${map} ${difficulty}`,
      tree: newTree.sha,
      parents: [latestCommitSha]
    });

    // Update reference
    await octokit.git.updateRef({
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      ref: 'heads/main',
      sha: commit.sha
    });

    return res.status(200).json({
      success: true,
      message: currentPb === undefined 
        ? 'New personal best recorded!' 
        : 'Personal best updated!',
      oldTime: currentPb,
      newTime: timeMs,
      leaderboardPosition: updatedLeaderboard.findIndex(e => 
        e.compositeUserId.platformId === platformUserId
      ) + 1,
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