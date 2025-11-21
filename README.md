# 2025gsc_YudaiKato
2025年ゼミ論

## テーマ
音楽視聴履歴と移動ログを組み合わせた「音楽散歩地図」アプリの作成

## 概要
音楽は人の気分や記憶と深い結びつきを持ち、移動中に聴いた音楽は場所の記憶と強く関連すると考えられる。しかし現在、「どこで・どんな音楽を聴いたか」を記録・共有する仕組みは存在しない。そこで本研究ではSpotify APIなどを用いて音楽の視聴履歴を取得し、位置情報と組み合わせて「音楽散歩地図」を生成する。これにより、音楽体験を空間的に可視化し、新しい体験価値や研究的知見を得ることを目的とする。さらに得られたデータを分析することで、時間帯や移動手段、天候や気分と音楽選択の関係を明らかにし、都市研究や観光への応用を目指す。

## 研究方法
- **データ取得**
  - Spotify APIなどを用いて音楽視聴履歴（曲名・アーティスト・再生時間）を取得
  - スマートフォンのGPSまたはGoogle Timeline等から位置情報を取得
- **統合と可視化**
  - 音楽データと位置情報をマージし、「音楽散歩地図」として地図上にマッピング
- **分析**
  - 時間帯、移動手段、天候、気分などと音楽選択の関係を探索的に分析予定

---

## 開発環境メモ
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

### Getting Started

開発サーバーの起動:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) にアクセスするとアプリが確認できます。

`app/page.tsx` を編集するとページが自動で更新されます。



### Learn More

- [Next.js Documentation](https://nextjs.org/docs) - Next.js の機能やAPI
- [Learn Next.js](https://nextjs.org/learn) - 対話型チュートリアル

### Deploy on Vercel

Next.js アプリを最も簡単にデプロイするには、Vercel プラットフォームの利用が便利です。
詳しくは [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) を参照してください。
