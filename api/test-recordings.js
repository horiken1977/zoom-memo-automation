/**
 * Zoom録画一覧取得テストエンドポイント
 * 実際の録画データ取得をテスト
 */

export const config = {
  maxDuration: 60
};

export default async function handler(req, res) {
  console.log('=== Zoom録画一覧取得テスト開始 ===');
  
  try {
    // 1. 環境変数の確認
    const accountId = process.env.ZOOM_ACCOUNT_ID;
    const clientId = process.env.ZOOM_API_KEY;
    const clientSecret = process.env.ZOOM_API_SECRET;
    
    if (!accountId || !clientId || !clientSecret) {
      return res.status(500).json({
        success: false,
        error: '環境変数が設定されていません',
        required: ['ZOOM_ACCOUNT_ID', 'ZOOM_API_KEY', 'ZOOM_API_SECRET'],
        suggestion: '先に /api/test-zoom-auth で認証設定を確認してください'
      });
    }
    
    // 2. OAuth トークンの取得
    console.log('OAuthトークン取得中...');
    
    const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenResponse.ok) {
      return res.status(tokenResponse.status).json({
        success: false,
        error: 'OAuth認証に失敗しました',
        details: tokenData,
        status: tokenResponse.status
      });
    }
    
    console.log('トークン取得成功');
    
    // 3. 録画一覧を取得（過去7日間）
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 7);
    
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];
    
    console.log(`取得期間: ${fromStr} 〜 ${toStr}`);
    
    // まず全ユーザーの一覧を取得
    const usersUrl = 'https://api.zoom.us/v2/users?page_size=300&status=active';
    
    const usersResponse = await fetch(usersUrl, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });
    
    const usersData = await usersResponse.json();
    
    if (!usersResponse.ok) {
      console.error('ユーザー一覧取得エラー:', usersData);
      return res.status(200).json({
        success: false,
        error: 'ユーザー一覧の取得に失敗しました',
        details: usersData,
        note: 'user:read:list_users:admin スコープが必要です'
      });
    }
    
    console.log(`取得したユーザー数: ${usersData.users ? usersData.users.length : 0}`);
    
    // 4. 各ユーザーの録画を取得
    let allRecordings = [];
    const errors = [];
    
    if (usersData.users && usersData.users.length > 0) {
      for (const user of usersData.users.slice(0, 5)) { // 最初の5ユーザーのみテスト
        try {
          const recordingsUrl = `https://api.zoom.us/v2/users/${user.id}/recordings?from=${fromStr}&to=${toStr}`;
          
          const recordingsResponse = await fetch(recordingsUrl, {
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`
            }
          });
          
          const recordingsData = await recordingsResponse.json();
          
          if (recordingsResponse.ok && recordingsData.meetings) {
            allRecordings = allRecordings.concat(recordingsData.meetings);
            console.log(`${user.email}: ${recordingsData.meetings.length}件の録画`);
          } else if (!recordingsResponse.ok) {
            errors.push({
              user: user.email,
              error: recordingsData
            });
          }
        } catch (err) {
          errors.push({
            user: user.email,
            error: err.message
          });
        }
      }
    }
    
    // 5. 結果の整形
    const summary = {
      success: true,
      period: {
        from: fromStr,
        to: toStr
      },
      userCount: usersData.users ? usersData.users.length : 0,
      checkedUsers: Math.min(5, usersData.users ? usersData.users.length : 0),
      totalMeetings: allRecordings.length,
      meetings: allRecordings.map(meeting => ({
        id: meeting.id,
        uuid: meeting.uuid,
        topic: meeting.topic,
        startTime: meeting.start_time,
        duration: meeting.duration,
        hostEmail: meeting.host_email,
        recordingCount: meeting.recording_files ? meeting.recording_files.length : 0,
        totalSize: meeting.recording_files ? 
          meeting.recording_files.reduce((sum, file) => sum + (file.file_size || 0), 0) : 0
      })),
      errors: errors.length > 0 ? errors : undefined
    };
    
    // 統計情報
    const stats = {
      totalRecordingFiles: allRecordings.reduce((acc, meeting) => 
        acc + (meeting.recording_files ? meeting.recording_files.length : 0), 0
      ),
      totalSizeBytes: allRecordings.reduce((acc, meeting) => 
        acc + (meeting.recording_files ? 
          meeting.recording_files.reduce((sum, file) => sum + (file.file_size || 0), 0) : 0), 0
      ),
      averageDurationMinutes: allRecordings.length > 0 ? 
        allRecordings.reduce((acc, meeting) => acc + (meeting.duration || 0), 0) / allRecordings.length : 0
    };
    
    // 詳細ログ
    if (allRecordings.length > 0) {
      console.log('最初の録画詳細:', JSON.stringify(allRecordings[0], null, 2));
    }
    
    return res.status(200).json({
      ...summary,
      statistics: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('録画一覧取得エラー:', error);
    
    return res.status(500).json({
      success: false,
      error: 'テスト実行中にエラーが発生しました',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      suggestion: '先に /api/test-zoom-auth で認証テストを実行してください'
    });
  }
}