let userMap = null;

async function loadMappings() {
  if (!userMap) {
    try {
      const response = await fetch('https://sgracers.vercel.app/pbs/platformUserIdKey.json');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} loading mappings`);
      }

      const textData = await response.text();

      const data = JSON.parse(textData);
      userMap = new Map();
      
      // Handle both array and object formats
      const entries = Array.isArray(data) ? data : Object.values(data);
      
      entries.forEach(user => {
        if (user?.platformUserId && user?.userId) {
          userMap.set(
            String(user.platformUserId).trim(),
            String(user.userId).trim()
          );
        }
      });
      
      console.log(`Loaded ${userMap.size} valid mappings`);
      
    } catch (error) {
      console.error('LOAD ERROR:', error);
      throw new Error(`Failed to load mappings: ${error.message}`);
    }
  }
  return userMap;
}

module.exports = {
  async getUserId(platformId) {
    try {
      const map = await loadMappings();
      return map?.get(String(platformId).trim()) || null;
    } catch {
      return null;
    }
  }
};