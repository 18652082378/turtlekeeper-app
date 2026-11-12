(function () {
  "use strict";

  // Keep restrictions from earlier releases, including retired catalog codes.
  const legacyRestrictedCodes = new Set([
    "ABQ", "ALD", "ANG", "BWG", "CBQ", "CSG", "DBG", "DHG", "EBQ", "GBG", "GJG", "HBQ", "HET", "HJG", "HNT", "HYG",
    "JDG", "JQG", "JTG", "JYG", "KBT", "KNG", "LHG", "LJG", "LKG", "MBG", "MDG", "MJG", "MLG", "MNG", "PDG", "PGG", "PHG",
    "PTG", "QBT", "QYG", "RTG", "SBQ", "SDG", "SGG", "SHG", "SLG", "SSG", "STG", "XGG", "XPG", "YBG", "YHG", "YLG", "YNT",
    "YSG", "YTG", "ZRG"
  ]);

  // Platform publishing policy. The app cannot verify individual origin,
  // wildlife permits or special markings, including for wild-only listings.
  // National list (2021 no. 3): https://lyt.fj.gov.cn/zwgk/slbhnew/202306/P020230627370594587697.pdf
  // Approved aquatic taxa (MOA no. 491): https://hyyyj.fujian.gov.cn/xxgk/tzgg/202201/P020220112599767343126.pdf
  // CITES Appendix I and tortoises (March 2026): https://www.forestry.gov.cn/u/cms/www/202603/07094239sawe.pdf
  const restrictedFamilies = new Set(["cheloniidae", "dermochelyidae", "platysternidae", "podocnemididae", "testudinidae"]);
  const restrictedGenera = new Set(["batagur", "chitra", "cuora", "cyclemys", "nilssonia", "pangshura", "pelochelys", "rafetus", "terrapene"]);
  const restrictedSpecies = new Set([
    "amyda cartilaginea", "apalone spinifera", "carettochelys insculpta",
    "chelodina mccordi", "clemmys guttata", "cyclanorbis elegans", "cyclanorbis senegalensis",
    "cycloderma aubryi", "cycloderma frenatum", "dermatemys mawii", "dogania subplana",
    "emydoidea blandingii", "geoclemys hamiltonii", "geoemyda japonica", "geoemyda spengleri",
    "glyptemys insculpta", "glyptemys muhlenbergii", "hardella thurjii",
    "heosemys annandalii", "heosemys depressa", "heosemys grandis", "heosemys spinosa",
    "kinosternon cora", "kinosternon vogti", "leucocephalon yuwonoi",
    "lissemys ceylonensis", "lissemys punctata", "lissemys scutata",
    "malaclemys terrapin", "malayemys macrocephala", "malayemys subtrijuga",
    "mauremys annamensis", "mauremys japonica", "mauremys mutica", "mauremys nigricans", "mauremys reevesii", "mauremys sinensis",
    "melanochelys tricarinata", "melanochelys trijuga", "morenia ocellata", "morenia petersi",
    "notochelys platynota", "orlitia borneensis", "palea steindachneri",
    "pelodiscus axenaria", "pelodiscus maackii", "pelodiscus parviformis",
    "pseudemydura umbrina", "sacalia bealei", "sacalia quadriocellata",
    "siebenrockiella crassicollis", "siebenrockiella leytensis", "trionyx triunguis", "vijayachelys silvatica"
  ]);

  function isRestricted(species) {
    if (!species || species.extinct || species.referenceOnly) return true;
    const codes = [species.code, ...(species.legacyCodes || [])];
    if (codes.some(code => legacyRestrictedCodes.has(String(code).trim().toUpperCase()))) return true;
    if (restrictedFamilies.has(String(species.family || "").toLowerCase())) return true;
    return [species.scientific, ...(species.aliases || [])].some(name => {
      const [genus, epithet] = String(name || "").trim().toLowerCase().split(/\s+/);
      return restrictedGenera.has(genus) || restrictedSpecies.has(`${genus} ${epithet}`);
    });
  }

  if (typeof module === "object" && module.exports) module.exports = isRestricted;
  else window.TURTLE_MARKET_RESTRICTED = isRestricted;
})();
