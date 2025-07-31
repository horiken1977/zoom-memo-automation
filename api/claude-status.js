/**
 * Claude対話記録の更新状態を返すAPI
 */
const fs = require('fs').promises;
const path = require('path');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const claudeMdPath = path.join(__dirname, '../0.docs/claude.md');
    const stats = await fs.stat(claudeMdPath);
    
    // 最終更新から5分以内なら「更新あり」とする
    const hasUpdates = (Date.now() - stats.mtime.getTime()) < 5 * 60 * 1000;
    
    res.status(200).json({
      hasUpdates,
      lastModified: stats.mtime,
      size: stats.size
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      hasUpdates: false
    });
  }
};