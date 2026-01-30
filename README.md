# 2025gsc_YudaiKato
2025年ゼミ論

## Theme
音楽視聴履歴と移動ログを組み合わせた「音楽散歩地図」アプリの作成

## 1. Introduction
音楽は人の気分や記憶と深い結びつきを持ち、移動中に聴いた音楽は場所の記憶と強く関連すると考えられる。そのため、日常の音楽聴取は、移動や場所、気分などの文脈と結びつきやすく、振り返りの手がかりになり得る。一方、一般的な再生履歴は時系列リストとして提示されることが多く、「どこで」「どんな気分で」聴いたかといった文脈は残りにくい。そこで本研究では、Spotify API から取得した再生履歴に対し、端末の位置情報（Geolocation）と外部天気API（OpenWeatherMap）による天気情報、ユーザー入力の気分（mood）を付与し、(1) 再生単位のログとして保存し、(2) 地図上に可視化し、(3) mood× 天気（および時間帯）といった簡易集計を提示することで、音楽体験の空間的な振り返りを支援することを目的とする。また、ゼミ論での最終着地点としてはSpotifyの再生履歴を基盤として、再生単位で気分（mood）と天気を記録し、聴取体験を地図上で可視化して振り返ることを支援するWebアプリケーション（音楽散歩地図）のプロトタイプを開発することする。

## 2. Method
### 2.1 全体概要
実装はNext.js（App Router）を基盤とし、クライアント（UI）とサーバ（API Routes）で責務を分離している。

- クライアント：再生履歴表示、再生中トラック検知（ポーリング）、位置情報取得、地図表示、moodフィルタ、集計表示
- Spotify OAuth（PKCE）処理、Spotify API プロキシ、Supabase への保存・更新・取得、OpenWeatherMap 呼び出し、集計API
- DB：Supabase（PostgreSQL）上のtracks / listens テーブルを前提とした保存
### 2.2 Spotify認証
/api/spotify/login でPKCE（code_verifier / code_challenge）とstate を生成してSpotify 認可画面へリダイレクトし、/api/spotify/callback で認可コードをアクセストークン・リフレッシュトークンに交換する。トークン類はHTTP Only Cookie として保存され、以降のSpotify API 呼び出し（例：/api/spotify/recent）はサーバ側ルートがCookie のアクセストークンを参照して代理実行する。

### 2.3 再生履歴の取得と自動保存
ホーム画面（src/app/page.tsx）は以下を行う。
1. /api/spotify/recent から直近の再生履歴（最大50件）を取得して表示する。
2. /api/listens から保存済みログを取得し、再生履歴と突合して「保存済み」状態（ピン留め相
当）を管理する。
3. /api/spotify/currently-playing を15秒間隔でポーリングし、再生中トラックが検知され
ると保存処理を試行する。
4. 保存時にはnavigator.geolocation.getCurrentPosition で緯度経度を取得し、/api/listens
(POST) へ送信する。

重複保存を避けるため、(a) 同一トラックの近傍時刻判定、(b) 保存キーの共有（localStorage）によるタブ間ロック、(c) サーバ側の簡易重複排除（同一track_id× 同一spotify_played_at×近傍座標）を併用している。

### 2.4 天気取得とDB 保存（Supabase）
/api/listens (POST) は入力をサニタイズした上で、tracks を spotify_track_id で upsertし、取得した track_id を用いて listens へ挿入する。また、OPENWEATHER_API_KEY が設定され、かつ緯度経度が妥当な場合に OpenWeatherMap の現在天気 API を呼び出し、代表的な値（weather_main, weather_description, weather_temp_c）を listens へ格納する。

### 2.5 地図可視化（MapLibre）
地図画面（src/app/map/page.tsx）は/api/listens から取得したログをマーカーとして描画する。

- ベースマップ：OpenStreetMap タイル
- マーカー：mood に応じて色分け（happy/soso/sad/other）
- ポップアップ：曲名、アーティスト、再生時刻、mood、天気情報を表示
- 初期表示：全マーカーが収まるようfitBounds
- サイドリスト：クリックで該当地点へflyTo し、ポップアップを開く

### 2.6 集計（mood× 天気× 時間帯）
統計画面（src/app/stats/page.tsx） は/api/stats を呼び出し、listens からmood とweather_main（およびplayed_at から推定した時間帯）を用いて件数集計を表示する。
実装上は、Supabase から必要列を取得した後、サーバ側でMap 集計を行う（単純だがデータ量増大時には改善余地がある）。


## 3. Result

1. Spotify OAuth（PKCE）により、ログイン・コールバック処理が実装され、Cookie でトークンを保持してSpotify API を呼び出せる。
2. 再生履歴（recently played）と再生中トラック（currently playing）の取得が実装され、再生中トラックは15 秒周期で監視される。
3. 位置情報（緯度経度）を付与して再生ログをSupabase へ保存し、必要に応じてOpenWeatherMapから天気情報を取得して同一ログに格納できる。
4. 保存済みログを地図（MapLibre）上にマーカーとして可視化し、mood フィルタと詳細ポップアップ表示により振り返りを支援できる。
5. mood× 天気およびmood× 天気× 時間帯の件数集計を表示できる。
## 4. Discusstion
本実装は、再生履歴を「時系列」ではなく「空間（地図）」へ投影し、さらに気分・天気という文脈変数を同時保存することで、体験の回顧を支えるデータ構造とUI を提供している点に意義がある。特に、(i) 再生単位での記録、(ii) 地図上での分布把握、(iii) mood/天気の簡易集計、を同一アプリ内で完結させている。


---


