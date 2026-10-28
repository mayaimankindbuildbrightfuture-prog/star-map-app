# star-map-app（星空マップ）

指定した場所・日時に、その場所から見える星と星座を対応づけて表示する Web アプリです。
ビルド不要の静的ファイルだけで動き、`index.html` をブラウザで開くだけで使えます。

## 使い方

1. `index.html` をブラウザで開きます（ダブルクリックで OK。サーバーは不要です）。
2. **場所**: 都市を選ぶ／緯度・経度を入力する／「📍 現在地を使う」のいずれかで指定します。
   - 現在地の取得は、ブラウザによっては `https://` または `http://localhost` で開いたときだけ使えます。
3. **日時**: 既定は現在時刻です。日時欄とタイムゾーンを変えると、その時刻の星空になります（夏時間にも対応）。
   - 「−1日 / −1時間 / +1時間 / +1日」ボタンやスライダー（±12時間）で時刻を動かせます。「▶ 再生」で早送りします。
4. **星図の見かた**: 天頂を中心にした円形の全天図で、外周が地平線です。上が北・左が東・下が南・右が西で、
   空を見上げたときの向きです（頭上にかざして方角を合わせると実際の空と一致します）。
   - 点線の円は高度 30°・60° の目安です。星の点の大きさは明るさ（等級）、色は表面温度の目安です。
   - 星や星座線・星座名をタップすると、名前・等級・高度・方位を表示します。
   - 右側（スマホでは下）の「いま見える星座」一覧から選ぶこともできます。
   - 太陽・月が地平線より上にあるときは表示し、空の色で昼間・薄明・夜を表します。
5. **表示**: 星座線・星座名・星の名前・目盛りの表示切替、表示する等級の上限、夜間モード（赤い画面）を選べます。
   場所と表示設定はブラウザに保存されます。

## GitHub Pages で公開する

リポジトリの **Settings → Pages** で「Deploy from a branch」、ブランチ `main`・フォルダ `/ (root)` を選ぶと、
そのまま公開できます（`.nojekyll` を置いてあります）。

## ファイル構成

| パス | 内容 |
| --- | --- |
| `index.html`, `style.css` | 画面 |
| `js/astro.js` | 天文計算（恒星時・歳差・地平座標変換・太陽と月・タイムゾーン）。ブラウザと Node.js の両方で動きます |
| `js/app.js` | 画面の制御と Canvas による星図の描画・タップ判定 |
| `data/stars.json` | 5.0 等より明るい恒星 1630 個（赤経・赤緯 J2000、等級、温度、バイエル符号、英語・日本語の固有名） |
| `data/constellations.json` | 88 星座の星座線・日本語名・ラテン語名・ラベル位置 |
| `data/*.js` | 上の JSON と同じ内容を JS 変数にしたもの（`file://` で開いたときに読み込むため） |
| `tools/build_data.py` | 元データから `data/` を生成するスクリプト |
| `test/astro.test.js` | 計算の検証テスト |

## 計算方法

- ユリウス日からグリニッジ平均恒星時を求め（Meeus『Astronomical Algorithms』12.4 式）、経度を足して地方恒星時を出します。
- J2000.0 の赤経・赤緯を観測日の春分点に歳差補正（Meeus 21 章）してから、時角と緯度で高度・方位に変換します。
  方位は北 = 0°、東 = 90° です。高度 0° 以上の星だけを表示します。
- 章動・光行差・大気差（地平線付近で約 0.5° 浮き上がって見える効果）は考慮していません。誤差は通常 1° 未満です。
- 太陽・月は簡略式（Meeus 25 章・47 章の主要項）で、月は 0.3° 程度の精度です。
- 投影は天頂中心の立体射影（星座の形がゆがみにくい方式）です。

## テスト

Node.js 18 以上で次を実行します。

```sh
npm test        # または: node --test test/astro.test.js
```

確認している内容の例:

- 恒星時・地平座標・歳差・月位置を Meeus の計算例（例 12.a/12.b, 13.b, 21.b, 47.a）と比較
- 北極星の高度が観測地の緯度とほぼ等しい（那覇・東京・札幌・ロンドン、時刻を変えて）
- 東京・1 月 15 日 22 時にオリオン座の主な星が南の空（高度 30° 以上）に見える
- 東京・8 月 1 日 21 時にアンタレスが南の空、ベガが天頂付近、ベテルギウスは地平線の下
- シドニーではみなみじゅうじ座が見え、北極星は見えない
- 東京の夏至の太陽の南中高度、タイムゾーン変換（夏時間を含む）、データの整合性（88 星座がそろっている等）

## データを作り直す

```sh
mkdir src && cd src
curl -LO https://raw.githubusercontent.com/brettonw/YaleBrightStarCatalog/master/bsc5-short.json
curl -LO https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.json
curl -LO https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json
cd .. && python3 tools/build_data.py src
```

等級の上限や日本語名は `tools/build_data.py` の `MAG_LIMIT`・`JA_NAMES` で変えられます。

## データ出典

- **恒星**: Yale Bright Star Catalogue, 5th Revised Edition（Hoffleit & Warren, 1991。NASA/ADC・CDS カタログ V/50 として公開）。
  JSON 化は [brettonw/YaleBrightStarCatalog](https://github.com/brettonw/YaleBrightStarCatalog) のものを使用。
  日本語の固有名は本リポジトリで付けたものです。
- **星座線・星座名（日本語名を含む）**: [d3-celestial](https://github.com/ofrohn/d3-celestial) © 2015 Olaf Frohn、
  BSD-3-Clause ライセンス（全文は `data/LICENSE-d3-celestial.txt`）。ラベル位置は星座線の頂点から計算し直しています。
