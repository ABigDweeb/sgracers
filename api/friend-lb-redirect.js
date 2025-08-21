import { getUserId } from './utils/userMappings';

export const config = {
  runtime: 'edge'
};

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({
      error: 'Method not allowed',
      allowed: ['POST']
    }), { status: 405 });
  }

  try {
    const body = await request.json();
    const { category, difficulty } = body || {};
    
    if (!category || !difficulty) {
      return new Response(JSON.stringify({
        error: 'Missing parameters',
        required: { category: 'string', difficulty: 'string' }
      }), { status: 400 });
    }

    const leaderboardUrl = new URL(
      `/leaderboards/${encodeURIComponent(category)}_${encodeURIComponent(difficulty)}.json`,
      request.url
    );
    
    const leaderboardResponse = await fetch(leaderboardUrl);
    if (!leaderboardResponse.ok) {
      return new Response(JSON.stringify({
        error: 'Leaderboard not found',
        path: leaderboardUrl.pathname
      }), { status: 404 });
    }

    const leaderboardData = await leaderboardResponse.json();

    const formattedData = await Promise.all(
      leaderboardData.map(async (entry) => {
        const platformId = entry.compositeUserId?.platformId;
        return {
          userId: await getUserId(platformId) || platformId,
          platform: entry.compositeUserId?.platform || 'STEAM',
          value: entry.value,
          difficulty: difficulty
        };
      })
    );

    const filteredData = formattedData.filter(entry => entry.userId);

    return new Response(JSON.stringify(filteredData), {
      headers: { 
        'Content-Type': 'application/json',
        'X-Data-Source': `${category}_${difficulty}`
      }
    });

  } catch (error) {
    console.error('Handler error:', error);
    return new Response(JSON.stringify({
      error: 'Processing error',
      details: error.message
    }), { status: 500 });
  }
}