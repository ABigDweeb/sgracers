const { Octokit } = require('@octokit/rest');

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
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (e) {
    return res.status(400).json({ 
      error: 'Invalid JSON',
      details: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }

  const { platformUserId, newDisplayName } = body;
  if (!platformUserId || !newDisplayName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  try {
    const { data: { commit: { sha: latestCommitSha } } } = await octokit.repos.getBranch({
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      branch: 'main'
    });

    const { data: leaderboardFiles } = await octokit.repos.getContent({
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      path: 'leaderboards',
      ref: 'main'
    });

    const jsonFiles = leaderboardFiles.filter(file => 
      file.name.endsWith('.json')
    );

    const treeUpdates = [];
    let updatedFilesCount = 0;

    for (const file of jsonFiles) {
      try {
        const { data } = await octokit.repos.getContent({
          owner: process.env.GITHUB_REPO_OWNER,
          repo: process.env.GITHUB_REPO_NAME,
          path: file.path,
          ref: 'main'
        });

        const content = Buffer.from(data.content, 'base64').toString();
        const leaderboard = JSON.parse(content.replace(/^\uFEFF/, ''));
        
        const userEntry = leaderboard.find(e => 
          e.compositeUserId.platformId === platformUserId
        );

        if (userEntry) {
          userEntry.displayName = newDisplayName;
          
          const { data: blob } = await octokit.git.createBlob({
            owner: process.env.GITHUB_REPO_OWNER,
            repo: process.env.GITHUB_REPO_NAME,
            content: JSON.stringify(leaderboard, null, 2),
            encoding: 'utf-8'
          });

          treeUpdates.push({
            path: file.path,
            mode: '100644',
            type: 'blob',
            sha: blob.sha
          });

          updatedFilesCount++;
        }
      } catch (error) {
        console.error(`Error processing ${file.path}:`, error.message);
      }
    }

    if (updatedFilesCount === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found in any leaderboard'
      });
    }

    const { data: newTree } = await octokit.git.createTree({
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      base_tree: latestCommitSha,
      tree: treeUpdates
    });

    const { data: commit } = await octokit.git.createCommit({
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      message: `Updated display name for user ${platformUserId} to "${newDisplayName}"`,
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
      message: `Display name updated in ${updatedFilesCount} leaderboard(s)`,
      updatedFilesCount,
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