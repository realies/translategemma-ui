import { describe, it, expect } from "vitest";
import { languages, VALID_LANGUAGE_CODES } from "~/lib/languages";
import { toAppCode, zhVariant } from "./mapping";

const lite = (label: string) => toAppCode("lite", label, "text");
const accurate = (label: string) => toAppCode("accurate", label, "text");
const bases = [...new Set(languages.map((l) => l.code.split("_")[0] ?? l.code))];

describe("toAppCode", () => {
  it("maps every app base to a valid app code", () => {
    expect(bases).toHaveLength(51);
    for (const base of bases) {
      expect(VALID_LANGUAGE_CODES.has(lite(base) ?? ""), base).toBe(true);
    }
  });

  it("uses the preferred variant for every base with several app codes", () => {
    expect([lite("fr"), lite("pt"), lite("ar"), lite("sw")]).toEqual([
      "fr_FR",
      "pt_BR",
      "ar_EG",
      "sw_TZ",
    ]);
    // A new regional variant must come with an explicit choice here.
    const multi = bases.filter(
      (b) => languages.filter((l) => l.code.startsWith(`${b}_`)).length > 1
    );
    expect(multi.sort()).toEqual(["ar", "fr", "pt", "sw", "zh"]);
  });

  it("maps CLD3's legacy codes", () => {
    expect([lite("iw"), lite("tl"), lite("no")]).toEqual(["he_IL", "fil_PH", "no_NO"]);
  });

  it("never maps another language to a close app language", () => {
    for (const label of ["bs", "ms", "af", "haw"]) expect(lite(label), label).toBeNull();
    for (const label of ["bos_Latn", "zsm_Latn", "afr_Latn", "kpv_Cyrl"]) {
      expect(accurate(label), label).toBeNull();
    }
  });

  it("never maps CLD3's romanised labels", () => {
    for (const label of ["hi-Latn", "ru-Latn", "bg-Latn", "zh-Latn", "ja-Latn", "el-Latn"]) {
      expect(lite(label), label).toBeNull();
    }
  });

  it("maps GlotLID's regional and macrolanguage labels", () => {
    const groups: [string[], string][] = [
      [
        [
          "arb_Arab",
          "ary_Arab",
          "arz_Arab",
          "acm_Arab",
          "apc_Arab",
          "ars_Arab",
          "aeb_Arab",
          "arq_Arab",
        ],
        "ar_EG",
      ],
      [["ekk_Latn"], "et_EE"],
      [["lvs_Latn"], "lv_LV"],
      [["pes_Arab", "prs_Arab", "fas_Arab"], "fa_IR"],
      [["swh_Latn", "swc_Latn"], "sw_TZ"],
      [["nob_Latn", "nno_Latn"], "no_NO"],
      [["ind_Latn"], "id_ID"],
      [["hrv_Latn"], "hr_HR"],
      [["srp_Cyrl", "srp_Latn"], "sr_RS"],
      [["heb_Hebr"], "he_IL"],
      [["fil_Latn", "tgl_Latn"], "fil_PH"],
      [["zul_Latn"], "zu_ZA"],
      [["eng_Latn"], "en"],
      [["deu_Latn"], "de_DE"],
    ];
    for (const [labels, code] of groups) {
      expect(
        labels.map((l) => accurate(l)),
        code
      ).toEqual(labels.map(() => code));
    }
  });

  it("maps every Han-script GlotLID label to Chinese", () => {
    for (const label of ["cmn_Hani", "yue_Hani", "wuu_Hani", "lzh_Hani", "hak_Hani", "nan_Hani"]) {
      expect(toAppCode("accurate", label, "切換語言"), label).toBe("zh_TW");
    }
  });

  it("never maps GlotLID's romanised or other-script twins", () => {
    for (const label of ["hin_Latn", "arb_Latn", "rus_Latn", "zsm_Arab", "hun_Hung", "zho_Bopo"]) {
      expect(accurate(label), label).toBeNull();
    }
  });
});

describe("zhVariant", () => {
  it("decides Simplified or Traditional by script", () => {
    expect(zhVariant("这是简体中文的句子")).toBe("zh_CN");
    expect(zhVariant("這是繁體中文的句子")).toBe("zh_TW");
    expect(zhVariant("切換語言")).toBe("zh_TW");
    expect(toAppCode("lite", "zh", "這是繁體中文的句子")).toBe("zh_TW");
  });

  it("uses zh_CN for text written the same in both scripts", () => {
    expect(zhVariant("中文")).toBe("zh_CN");
    expect(zhVariant("茶几")).toBe("zh_CN"); // 几 (small table) is Traditional too
  });

  it("counts only characters OpenCC never keeps in the other script", () => {
    expect(zhVariant("不准停車")).toBe("zh_TW"); // 准 is Traditional too
    expect(zhVariant("台灣很美")).toBe("zh_TW"); // 台 is Traditional too
    expect(zhVariant("臺北")).toBe("zh_TW");
    expect(zhVariant("比他帥一點。")).toBe("zh_TW");
    expect(zhVariant("憂鬱")).toBe("zh_TW"); // outside the most common characters
    expect(zhVariant("忧郁")).toBe("zh_CN");
    expect(zhVariant("台湾很美")).toBe("zh_CN");
    expect(zhVariant("於是")).toBe("zh_CN"); // 於 stays in Simplified as a surname
  });
});
