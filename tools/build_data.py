#!/usr/bin/env python3
"""星データ・星座データを生成するスクリプト。

入力 (SRC_DIR に置く):
  bsc5-short.json            Yale Bright Star Catalogue 5th ed. の JSON 版
                             https://github.com/brettonw/YaleBrightStarCatalog
  constellations.json        d3-celestial (BSD-3-Clause) の星座名・ラベル位置
  constellations.lines.json  d3-celestial の星座線
                             https://github.com/ofrohn/d3-celestial/tree/master/data

出力:
  data/stars.json, data/constellations.json   (正本の JSON)
  data/stars.js,   data/constellations.js     (file:// で開けるよう同じ内容を JS 変数として出力)

使い方:
  python3 tools/build_data.py SRC_DIR
"""
import json
import math
import os
import re
import sys

MAG_LIMIT = 5.0

# 主な恒星の日本語名。キーはカタログの英語固有名 (N フィールド)。
JA_NAMES = {
    "Sirius": "シリウス", "Canopus": "カノープス", "Arcturus": "アークトゥルス",
    "Rigil Kentaurus": "リギル・ケンタウルス", "Vega": "ベガ（織女星）", "Capella": "カペラ",
    "Rigel": "リゲル", "Procyon": "プロキオン", "Achernar": "アケルナル",
    "Betelgeuse": "ベテルギウス", "Hadar": "ハダル", "Altair": "アルタイル（牽牛星）",
    "Acrux": "アクルックス", "Aldebaran": "アルデバラン", "Antares": "アンタレス",
    "Spica": "スピカ", "Pollux": "ポルックス", "Fomalhaut": "フォーマルハウト",
    "Deneb": "デネブ", "Mimosa": "ミモザ", "Regulus": "レグルス", "Adhara": "アダーラ",
    "Castor": "カストル", "Shaula": "シャウラ", "Gacrux": "ガクルックス",
    "Bellatrix": "ベラトリックス", "Elnath": "エルナト", "Alnilam": "アルニラム",
    "Alnitak": "アルニタク", "Mintaka": "ミンタカ", "Saiph": "サイフ", "Meissa": "メイサ",
    "Alioth": "アリオト", "Dubhe": "ドゥーベ", "Merak": "メラク", "Phecda": "フェクダ",
    "Megrez": "メグレズ", "Mizar": "ミザール", "Alcor": "アルコル", "Alkaid": "アルカイド",
    "Polaris": "ポラリス（北極星）", "Kochab": "コカブ", "Pherkad": "フェルカド",
    "Mirfak": "ミルファク", "Algol": "アルゴル", "Alpheratz": "アルフェラッツ",
    "Mirach": "ミラク", "Almach": "アルマク", "Hamal": "ハマル", "Sheratan": "シェラタン",
    "Menkar": "メンカル", "Mira": "ミラ", "Diphda": "デネブ・カイトス", "Schedar": "シェダル",
    "Caph": "カフ", "Navi": "ツィー", "Ruchbah": "ルクバー", "Segin": "セギン",
    "Scheat": "シェアト", "Algenib": "アルゲニブ", "Enif": "エニフ",
    "Denebola": "デネボラ", "Algieba": "アルギエバ", "Zosma": "ゾスマ", "Alphard": "アルファルド",
    "Rasalhague": "ラス・アルハゲ", "Sabik": "サビク", "Eltanin": "エルタニン",
    "Rastaban": "ラスタバン", "Thuban": "トゥバン", "Albireo": "アルビレオ", "Sadr": "サドル",
    "Kaus Australis": "カウス・アウストラリス", "Kaus Media": "カウス・メディア",
    "Kaus Borealis": "カウス・ボレアリス", "Nunki": "ヌンキ", "Ascella": "アスケラ",
    "Alnasl": "アルナスル", "Dschubba": "ジュバ", "Acrab": "アクラブ", "Sargas": "サルガス",
    "Lesath": "レサト", "Zubenelgenubi": "ズベン・エル・ゲヌビ",
    "Zubeneschamali": "ズベン・エス・カマリ", "Vindemiatrix": "ビンデミアトリックス",
    "Porrima": "ポリマ", "Alhena": "アルヘナ", "Mebsuta": "メブスタ", "Wasat": "ワサト",
    "Deneb Algedi": "デネブ・アルゲディ", "Dabih": "ダビー", "Sadalmelik": "サダルメリク",
    "Sadalsuud": "サダルスウド", "Alrescha": "アルレシャ", "Alcyone": "アルキオネ（すばる）",
    "Menkalinan": "メンカリナン", "Mirzam": "ミルザム", "Wezen": "ウェズン", "Aludra": "アルドラ",
    "Gomeisa": "ゴメイサ", "Unukalhai": "ウヌクアルハイ", "Alphecca": "アルフェッカ",
    "Izar": "イザール", "Muphrid": "ムフリッド", "Seginus": "セギヌス", "Nekkar": "ネッカル",
    "Kornephoros": "コルネフォロス", "Rasalgethi": "ラス・アルゲティ", "Sheliak": "シェリアク",
    "Sulafat": "スラファト", "Tarazed": "タラゼド", "Alshain": "アルシャイン",
    "Alderamin": "アルデラミン", "Suhail": "スハイル", "Avior": "アヴィオール",
    "Miaplacidus": "ミアプラキドゥス", "Alnair": "アルナイル", "Peacock": "ピーコック",
    "Atria": "アトリア", "Ankaa": "アンカー", "Naos": "ナオス", "Menkent": "メンケント",
    "Arneb": "アルネブ", "Nihal": "ニハル", "Phact": "ファクト", "Zaurak": "ザウラク",
    "Acamar": "アカマル", "Cursa": "クルサ", "Alkes": "アルケス", "Gienah": "ギェナー",
    "Algorab": "アルゴラブ", "Kraz": "クラズ", "Acubens": "アクベンス",
    "Asellus Borealis": "アセルス・ボレアリス", "Asellus Australis": "アセルス・アウストラリス",
    "Cebalrai": "ケバルライ", "Yed Prior": "イェド・プリオル", "Markab": "マルカブ",
    "Matar": "マタル", "Homam": "ホマム", "Skat": "スカト", "Nashira": "ナシラ",
    "Sadachbia": "サダクビア", "Edasich": "エダシク", "Errai": "エライ", "Alfirk": "アルフィルク",
    "Albali": "アルバリ", "Mesarthim": "メサルティム", "Chertan": "シェルタン",
    "Adhafera": "アダフェラ", "Rasalas": "ラサラス", "Tejat Posterior": "テジャト",
    "Propus": "プロプス", "Talitha": "タリタ", "Tania Borealis": "タニア・ボレアリス",
    "Tania Australis": "タニア・アウストラリス", "Alula Australis": "アルラ・アウストラリス",
    "Alula Borealis": "アルラ・ボレアリス", "Cor Caroli": "コル・カロリ",
    "Electra": "エレクトラ", "Atlas": "アトラス", "Maia": "マイア", "Merope": "メローペ",
    "Taygeta": "タイゲタ", "Graffias": "グラフィアス", "Deneb el Okab": "デネブ・エル・オカブ",
    "Ain": "アイン", "Hyadum I": "ヒアデスI", "Kitalpha": "キタルファ",
    "Deneb Kaitos Schemali": "デネブ・カイトス・シャマリ", "Baten Kaitos": "バテン・カイトス",
    "Theemin": "テエミン", "Azha": "アザー", "Achird": "アキルド", "Biham": "ビハム",
}

# カタログ側の名前の誤り・重複を補正 (HR 番号 -> 英語名, None は名前を外す)
NAME_FIXES = {
    "4915": "Cor Caroli",   # カタログ上 "Chara" になっている α CVn
    "4785": "Chara",
    "2948": None,           # "Markab" の重複 (ペガスス座 α は HR 8781)
    "343": None,            # "Marfark" (Marfak と重複)
}

GREEK = "αβγδεζηθικλμνξοπρστυφχψω"


def parse_ra(s):
    m = re.match(r"(\d+)h\s*(\d+)m\s*([\d.]+)s", s)
    h, mi, se = (float(x) for x in m.groups())
    return (h + mi / 60 + se / 3600) * 15


def parse_dec(s):
    m = re.match(r"([+-])(\d+)°\s*(\d+)′\s*([\d.]+)″", s)
    sign, d, mi, se = m.groups()
    v = float(d) + float(mi) / 60 + float(se) / 3600
    return -v if sign == "-" else v


def norm_ra(ra):
    return ra % 360


def main(src):
    with open(os.path.join(src, "bsc5-short.json"), encoding="utf-8") as f:
        bsc = json.load(f)
    with open(os.path.join(src, "constellations.json"), encoding="utf-8") as f:
        cons_meta = json.load(f)["features"]
    with open(os.path.join(src, "constellations.lines.json"), encoding="utf-8") as f:
        cons_lines = json.load(f)["features"]

    stars = []
    for r in bsc:
        if "V" not in r or "RA" not in r:
            continue
        v = float(r["V"])
        if v > MAG_LIMIT:
            continue
        hr = r["HR"]
        name = NAME_FIXES.get(hr, r.get("N")) if hr in NAME_FIXES else r.get("N")
        stars.append({
            "hr": int(hr),
            "ra": round(parse_ra(r["RA"]), 4),
            "dec": round(parse_dec(r["Dec"]), 4),
            "mag": v,
            "temp": int(r["K"]) if r.get("K") else None,
            "bayer": r.get("B", ""),
            "flam": r.get("F", ""),
            "con": r.get("C", ""),
            "name": name or "",
        })

    # 同じ固有名が複数の HR に付いている場合は最も明るい星だけに残す
    best = {}
    for s in stars:
        if s["name"]:
            if s["name"] not in best or s["mag"] < best[s["name"]]["mag"]:
                best[s["name"]] = s
    for s in stars:
        if s["name"] and best[s["name"]] is not s:
            s["name"] = ""
        s["ja"] = JA_NAMES.get(s["name"], "")

    missing = sorted(set(JA_NAMES) - {s["name"] for s in stars})
    if missing:
        print("warning: JA_NAMES not matched:", missing, file=sys.stderr)

    stars.sort(key=lambda s: s["mag"])
    fields = ["hr", "ra", "dec", "mag", "temp", "bayer", "flam", "con", "name", "ja"]
    star_out = {
        "source": "Yale Bright Star Catalogue, 5th Revised Ed. (Hoffleit & Warren 1991), V <= %.1f" % MAG_LIMIT,
        "epoch": "J2000.0",
        "fields": fields,
        "stars": [[s[k] for k in fields] for s in stars],
    }

    # 星座: 名前とラベル位置は constellations.json、線は constellations.lines.json
    meta_list = []
    ser_count = 0
    for f in cons_meta:
        cid = f["id"]
        if cid == "Ser":
            ser_count += 1
            cid = "Ser%d" % ser_count
        meta_list.append((cid, f))
    line_list = []
    ser_count = 0
    for f in cons_lines:
        cid = f["id"]
        if cid == "Ser":
            ser_count += 1
            cid = "Ser%d" % ser_count
        line_list.append((cid, f))
    lines_by_id = dict(line_list)

    cons = []
    for cid, f in meta_list:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        lf = lines_by_id.get(cid)
        lines = []
        if lf:
            for seg in lf["geometry"]["coordinates"]:
                lines.append([[round(norm_ra(x), 4), round(y, 4)] for x, y in seg])
        # ラベル位置: 星座線の頂点の重心 (球面上で平均)。線がなければ元データの位置
        if lines:
            pts = {(x, y) for seg in lines for x, y in seg}
            vx = sum(math.cos(math.radians(d)) * math.cos(math.radians(r)) for r, d in pts)
            vy = sum(math.cos(math.radians(d)) * math.sin(math.radians(r)) for r, d in pts)
            vz = sum(math.sin(math.radians(d)) for r, d in pts)
            lon = math.degrees(math.atan2(vy, vx))
            lat = math.degrees(math.atan2(vz, math.hypot(vx, vy)))
        cons.append({
            "id": cid,
            "abbr": p["desig"],
            "ja": p["ja"],
            "en": p["en"],
            "la": p["la"] if not cid.startswith("Ser") else p["name"],
            "rank": int(p["rank"]),
            "label": [round(norm_ra(lon), 3), round(lat, 3)],
            "lines": lines,
        })

    cons_out = {
        "source": "d3-celestial by Olaf Frohn (BSD-3-Clause), https://github.com/ofrohn/d3-celestial",
        "epoch": "J2000.0",
        "constellations": cons,
    }

    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
    for base, obj, var in (("stars", star_out, "STAR_DATA"),
                           ("constellations", cons_out, "CONSTELLATION_DATA")):
        text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
        with open(os.path.join(out_dir, base + ".json"), "w", encoding="utf-8") as f:
            f.write(text + "\n")
        with open(os.path.join(out_dir, base + ".js"), "w", encoding="utf-8") as f:
            f.write("// tools/build_data.py で生成。data/%s.json と同じ内容です。\n" % base)
            f.write("window.%s = %s;\n" % (var, text))
    print("stars: %d (named ja: %d), constellations: %d"
          % (len(stars), sum(1 for s in stars if s["ja"]), len(cons)))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
