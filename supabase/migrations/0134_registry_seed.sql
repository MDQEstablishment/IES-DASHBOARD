-- GENERATED FILE — do not hand-edit.
--   node scripts/import-tarshid-registries.mjs
-- regenerates it byte for byte from the committed artefacts. Edit the
-- script, or the artefacts, never this file.
--
-- Saving Sheet sprint, U1 (commit A of two) — the TARSHID registry mirrors.
--
-- Source of truth: the reference sheets EMBEDDED in TARSHID's own blank
-- templates, which is what their formulas look up (design §0.4). Values are
-- the sheets' cached <v> contents, VERBATIM: no trimming, no rounding, no
-- whitespace collapsing. Verbatim is not fussiness — collapsing whitespace
-- in model_no would merge three distinct AC rows and turn 1,516 into 1,513.
--
--   AC template / Old_Model_Registry
--     -> public.old_model_registry: 1516 populated rows
--   AC template / Aprvd Baseline Unit
--     -> public.approved_baseline_units: 194 populated rows
--   Lighting template / Old_Model_Registry
--     -> public.lighting_baseline_registry: 344 populated rows, 5 exact duplicate key(s) collapsed, 339 rows
--
-- DUPLICATE KEYS IN TARSHID'S OWN DATA (named, not swept):
--   lighting_baseline_registry: sheet rows 65 and 69 are byte-identical apart from
--     their serial number — "Conv-MV-E40-1X-175W". The later one is dropped.
--   lighting_baseline_registry: sheet rows 259 and 268 are byte-identical apart from
--     their serial number — "LED_Tube-T8-1.2M-2X-50W". The later one is dropped.
--   lighting_baseline_registry: sheet rows 121 and 312 are byte-identical apart from
--     their serial number — "LED_Bulb-E27-1X-20W". The later one is dropped.
--   lighting_baseline_registry: sheet rows 314 and 316 are byte-identical apart from
--     their serial number — "Conv-CFL-E27-1X-35W". The later one is dropped.
--   lighting_baseline_registry: sheet rows 237 and 319 are byte-identical apart from
--     their serial number — "LED_Bulb-E27-1X-50W". The later one is dropped.
--   The script ABORTS instead if two rows share a key and DIFFER anywhere
--   else, so a real conflict can never be collapsed away quietly.
--
-- TEXT IN A NUMERIC COLUMN: 109 of the AC rows carry non-numeric text in
--   Equivalent SEER — "Inverter" on 11, "-" on 98. "Inverter" is
--   TARSHID's marker that no SEER applies to an inverter unit (out of
--   replacement scope anyway, §1.1); "-" is a SEER they never established.
--   Both import as NULL rather than being coerced to a number. Nothing is
--   lost: compressor_type still names every inverter unit.
--   equivalent_seer is NULL on 393 rows in total — those 109 plus
--   284 whose cell is simply empty in the sheet.
--
-- KNOWN DIVERGENCE FROM src/lib/tarshidImport.js, deliberate: that module
--   collapses whitespace in model_no and rounds SEER/EER to 2dp and BTU/W to
--   integers. This import does neither. §1.2 already schedules a single
--   unified normaliser for U3; until it lands, re-importing these sheets
--   through the client-side TarshidImportModal would add near-duplicate rows
--   rather than update these. Do not do that.
--
-- Re-applying this file is a no-op: every upsert carries an IS DISTINCT FROM
-- guard, so an unchanged row is not even touched and updated_at does not move.
--
-- THE CONTENT DIGEST at the bottom is the strong proof and the reason the
-- ten spot rows are not the whole story. It hashes EVERY cell of EVERY row —
-- md5 per row, row digests sorted, md5 of the concatenation — and compares
-- it to the digest computed by the script directly from the .xlsx. The two
-- agree only if the database holds exactly the artefact, whatever route the
-- bytes took to get there. This matters here because this environment can
-- only reach Postgres through an MCP call, so the statements below are
-- applied a chunk at a time rather than by a migration runner; the digest is
-- what makes that route trustworthy instead of merely careful.

-- artefact sha256:
--   templates/tarshid/TARSHID-TEMPLATE-AC-SavingSheet.xlsx        2ccf89b2788a85814ec71c999670e41ac892e54fef06c4a48a2a32a0ef70915f
--   templates/tarshid/TARSHID-TEMPLATE-Lighting-SavingSheet.xlsx  9b681bd70897133c6e755d797517c6ac155cb9d4be2c8f2ecc3d18c45b533916

-- --------------------------------------------------------------------------
-- old_model_registry — 1516 rows from AC template / Old_Model_Registry
-- --------------------------------------------------------------------------
-- >>> CHUNK 1/11 — old_model_registry rows 1-200 of 1516
insert into public.old_model_registry as t (equipment_type, make, model_no, compressor_type, size_category, tr, t1_btu, t1_w, t1_eer, t3_btu, t3_w, t3_eer, equivalent_seer, surveyed_unit_description, equivalent_ac_model_description) values
('Window','LG','B182C','Non-Inverter','2',2,24000,2500,9.6,21000,3000,7,8.2099999999999991,'Window LG 2TR SEER 8.21','Window LG 2TR SEER 7.48'),
('Window','Carrier','CRVR243M-0G8','Non-Inverter','2',1.75,21000,2100,10,17500,2465,7.0993914807302234,8.4599999999999991,'Window Carrier 1.75TR SEER 8.46','Window York  1.75TR SEER 8.45'),
('Window','Carrier','CRVR243M-0G5','Non-Inverter','2',2,24050,2812,8.5526315789473681,20500,3333,6.1506150615061506,7.27,'Window Carrier 2TR SEER 7.27','Window Zamil 2TR SEER 7.24'),
('Window','Carrier','CRSR183M-008','Non-Inverter','1.5',1.43,17200,1720,10,15000,2083,7.2011521843494961,8.52,'Window Carrier 1.43TR SEER 8.52','Window Carrier 1.43TR SEER 8.52'),
('Window','Zamil','PAB24CIEQIN','Non-Inverter','2',2,24000,3200,7.5,19000,3520,5.3977272727272725,6.34,'Window Zamil 2TR SEER 6.34','Window Zamil 2TR SEER 6.34'),
('Window','Haas','H0125E8Y','Non-Inverter','2',1.83,22000,2155,10.208816705336426,18500,2570,7.1984435797665371,8.629999999999999,'Window Haas 1.83TR SEER 8.63','Window York  1.75TR SEER 8.45'),
('Window','Falcon','FSVR243M','Non-Inverter','2',1.75,21000,2100,10,17500,2465,7.0993914807302234,8.4599999999999991,'Window Falcon 1.75TR SEER 8.46','Window York  1.75TR SEER 8.45'),
('Window','Zamil','HHB19CHETI','Non-Inverter','1.5',1.5,18050,1857,9.7199784598815295,14500,2077,6.981222917669716,8.23,'Window Zamil 1.5TR SEER 8.23','Window Carrier 1.43TR SEER 8.52'),
('Window','Carrier','CRVR243M-oM','Non-Inverter','2',2,24000,2700,8.8888888888888893,18493,3100,5.9654838709677422,7.37,'Window Carrier 2TR SEER 7.37','Window  Zamil 2TR SEER 7.33'),
('Window','Zamil','ZHB18CGERIMNW','Non-Inverter','1.5',1.45,17500,2050,8.536585365853659,16000,2440,6.557377049180328,7.43,'Window Zamil 1.45TR SEER 7.43','Window LG 1.5TR SEER 7.70'),
('Window','Midea','MWTF2','Non-Inverter','2',1.7,20400,2042,9.9902056807051913,17400,2429,7.1634417455743105,8.49,'Window Midea 1.7TR SEER 8.49','Window York  1.75TR SEER 8.45'),
('Window','TIT','T2-24Ht16','Non-Inverter','2',1.69,20300,2055,9.8783454987834549,17300,2440,7.0901639344262293,8.4,'Window TIT 1.69TR SEER 8.4','Window York  1.75TR SEER 8.45'),
('Window','LG','W182EC SN2 /GWC182NAAB3','Non-Inverter','1.5',1.39,16719,2000,8.3595000000000006,13477,2300,5.859565217391304,7.0299999999999994,'Window LG 1.39TR SEER 7.03','Window LG 1.39TR SEER 7.03'),
('Window','Carrier','51HSR183MA0G','Non-Inverter','1.5',1.43,17200,1720,10,15000,2083,7.2011521843494961,8.52,'Window Carrier 1.43TR SEER 8.52','Window Carrier 1.43TR SEER 8.52'),
('Window','Carrier','CRSR183M-0GSE','Non-Inverter','1.5',1.48,17800,1745,10.200573065902578,15000,2083,7.2011521843494961,8.6199999999999992,'Window Carrier 1.48TR SEER 8.62','Window Carrier 1.5TR SEER 8.62'),
('Window','LG','Z182EC','Non-Inverter','1.5',1.49,17947,2110,8.505687203791469,15353,2500,6.1412000000000004,7.24,'Window LG 1.49TR SEER 7.24','Window LG 1.49TR SEER 7.24'),
('Window','Samsung','AHT18P1HBA','Non-Inverter','1.5',1.5,18000,2200,8.1818181818181817,14474,2600,5.5669230769230769,6.83,'Window Samsung 1.5TR SEER 6.83','Window Samsung 1.5TR SEER 6.82'),
('Window','LG','W182EH SN3','Non-Inverter','1.5',1.5,18000,2020,8.9108910891089117,14978.675007108332,2180,6.8709518381230881,7.7,'Window LG 1.5TR SEER 7.7','Window LG 1.5TR SEER 7.70'),
('Window','LG','LWH182NFAZ3','Non-Inverter','1.5',1.5,18000,2020,8.9108910891089117,14978.675007108332,2180,6.8709518381230881,7.7,'Window LG 1.5TR SEER 7.7','Window LG 1.5TR SEER 7.70'),
('Window','Zamil','YHB18CTEYIINW','Non-Inverter','1.5',1.5,18000,2200,8.1818181818181817,14000,2520,5.5555555555555554,6.81,'Window Zamil 1.5TR SEER 6.81','Window  Zamil 1.5TR SEER 6.80'),
('Window','Zamil','ACB19CTXPIMNW','Non-Inverter','1.5',1.54,18500,2260,8.1858407079646014,14000,2510,5.5776892430278888,6.8,'Window Zamil 1.54TR SEER 6.8','Window Carrier 1.43TR SEER 8.52'),
('Window','Zamil','AHB19CTEPIMNW','Non-Inverter','1.5',1.54,18500,2220,8.3333333333333339,14500,2580,5.6201550387596901,6.92,'Window Zamil 1.54TR SEER 6.92','Window Carrier 1.43TR SEER 8.52'),
('Window','LG','W242EH SN0','Non-Inverter','2',1.74,20983.793005402335,2500,8.3935172021609343,18493.033835655391,2950,6.2688250290357255,7.2299999999999995,'Window LG 1.74TR SEER 7.23','Window LG 1.74TR SEER 7.22'),
('Window','York','NYSR243M-0G8','Non-Inverter','2',1.75,21000,2100,10,17500,2465,7.0993914807302234,8.4599999999999991,'Window York 1.75TR SEER 8.46','Window York  1.75TR SEER 8.45'),
('Window','Zamil','NHB24CGERIMNW','Non-Inverter','2',1.87,22500,2630,8.5551330798479093,19500,3170,6.1514195583596214,7.2799999999999994,'Window Zamil 1.87TR SEER 7.28','Window Zamil 1.88TR SEER 7.28'),
('Window','LG','W242EH','Non-Inverter','2',2,24000,2560,9.375,16206,2880,5.6270833333333332,7.4799999999999995,'Window LG 2TR SEER 7.48','Window LG 2TR SEER 7.48'),
('Window','Zamil','PHB24CIEQIINW','Non-Inverter','2',2,24000,3200,7.5,19000,3520,5.3977272727272725,6.34,'Window Zamil 2TR SEER 6.34','Window Zamil 2TR SEER 6.34'),
('Window','Royal_Temp','WGS-24PE','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3800,5.4315789473684211,6.41,'Window Royal_Temp 2TR SEER 6.41','Window Royal Temp 2TR SEER 6.41'),
('Window','Zamil','AHB26CHHLKKNW','Non-Inverter','2',2,24000,3330,7.2072072072072073,18800,3300,5.6969696969696972,6.24,'Window Zamil 2TR SEER 6.24','Window  Zamil 2TR SEER 6.23'),
('Window','Zamil','ACB24CIXPIMNW','Non-Inverter','2',2,24000,3100,7.741935483870968,18000,3450,5.2173913043478262,6.41,'Window Zamil 2TR SEER 6.41','Window Royal Temp 2TR SEER 6.41'),
('Window','Zamil','LCB24CTXCIING','Non-Inverter','2',2,24000,2800,8.5714285714285712,18000,3350,5.3731343283582094,6.96,'Window Zamil 2TR SEER 6.96','Window  Zamil 2TR SEER 6.95'),
('Window','Zamil','AHB24CMESAANW','Non-Inverter','2',2,24000,2750,8.7272727272727266,18000,3060,5.882352941176471,7.2299999999999995,'Window Zamil 2TR SEER 7.23','Window  Zamil 2TR SEER 7.22'),
('Window','Zamil','AHB26CRELIINW','Non-Inverter','2',2,24000,2710,8.8560885608856097,17900,3001,5.964678440519827,7.33,'Window Zamil 2TR SEER 7.33','Window  Zamil 2TR SEER 7.33'),
('Window','Zamil','AHB24CREPLNW','Non-Inverter','2',2,24000,2800,8.5714285714285712,18000,3100,5.806451612903226,7.1099999999999994,'Window Zamil 2TR SEER 7.11','Window Zamil 2TR SEER 7.10'),
('Window','Zamil','AHB25CEBW','Non-Inverter','2',2,24000,2750,8.7272727272727266,18000,3100,5.806451612903226,7.2,'Window Zamil 2TR SEER 7.2','Window Zamil 2TR SEER 7.20'),
('Window','Zamil','UHB25CTESIJNW','Non-Inverter','2',2,24000,2800,8.5714285714285712,18000,3350,5.3731343283582094,6.96,'Window Zamil 2TR SEER 6.96','Window  Zamil 2TR SEER 6.95'),
('Window','Zamil','CHB24CEDW','Non-Inverter','2',2,24000,2750,8.7272727272727266,18000,3020,5.9602649006622519,7.25,'Window Zamil 2TR SEER 7.25','Window Zamil 2TR SEER 7.24'),
('Window','York','LYSD243M-0B5 / NYSD243M-0B5','Non-Inverter','2',2,24050,2813,8.5495911837895484,18970,3089,6.141146001942376,7.2299999999999995,'Window York 2TR SEER 7.23','Window Zamil 2TR SEER 7.24'),
('Window','Zamil','HHB24CHERKINW','Non-Inverter','2',2,24050,2813,8.5495911837895484,19000,3104,6.1211340206185563,7.22,'Window Zamil 2TR SEER 7.22','Window  Zamil 2TR SEER 7.22'),
('Window','Zamil','AHB26CHERKINW','Non-Inverter','2',2,24050,2813,8.5495911837895484,19000,3104,6.1211340206185563,7.22,'Window Zamil 2TR SEER 7.22','Window  Zamil 2TR SEER 7.22'),
('Window','Zamil','LCB24CKXGKINW','Non-Inverter','2',2.0099999999999998,24196,2574,9.4001554001554002,19000,2920,6.506849315068493,7.87,'Window Zamil 2.01TR SEER 7.87','Window Zamil 2.01TR SEER 7.86'),
('Window','York','LYSD243M-0C8 / NYSD243M-0C8','Non-Inverter','2',2.0099999999999998,24200,2674,9.0501121914734473,18700,2968,6.3005390835579513,7.58,'Window York 2.01TR SEER 7.58','Window York  2.01TR SEER 7.57'),
('Window','Carrier','CRSD243M-0C8','Non-Inverter','2',2.0099999999999998,24200,2674,9.0501121914734473,18700,2968,6.3005390835579513,7.58,'Window Carrier 2.01TR SEER 7.58','Window York  2.01TR SEER 7.57'),
('Window','Carrier','C2K24MB-RG9','Non-Inverter','2',2.0099999999999998,24200,2674,9.0501121914734473,19500,3095,6.30048465266559,7.6,'Window Carrier 2.01TR SEER 7.6','Window Carrier 2.01TR SEER 7.59'),
('Window','Haas','HE24E6YH3XHS00','Non-Inverter','2',2.0099999999999998,24200,2574,9.4017094017094021,21000,3206,6.5502183406113534,7.9399999999999995,'Window Haas 2.01TR SEER 7.94','Window HAAS 2.01TR SEER 7.93'),
('Window','Zamil','HHB24CKEGKINW','Non-Inverter','2',2.0099999999999998,24200,2574,9.4017094017094021,19000,2920,6.506849315068493,7.87,'Window Zamil 2.01TR SEER 7.87','Window Zamil 2.01TR SEER 7.86'),
('Window','Zamil','ZHD24CAEGKNNW','Non-Inverter','2',2.0099999999999998,24200,2574,9.4017094017094021,20000,3075,6.5040650406504064,7.89,'Window Zamil 2.01TR SEER 7.89','Window Zamil 2.01TR SEER 7.89'),
('Window','Carrier','51HSD243MA0C','Non-Inverter','2',2.0099999999999998,24200,2674,9.0501121914734473,18700,2968,6.3005390835579513,7.58,'Window Carrier 2.01TR SEER 7.58','Window York  2.01TR SEER 7.57'),
('Window','Frego','FT18X2P22','Non-Inverter','1.5',1.45,17500,1750,10,15000,2098,7.1496663489037182,8.49,'Window Frego 1.45TR SEER 8.49','Window Carrier 1.43TR SEER 8.52'),
('Window','Carrier','CRSD183M-0C','Non-Inverter','1.5',1.5,18000,2300,7.8260869565217392,14504,2650,5.4732075471698112,6.58,'Window Carrier 1.5TR SEER 6.58','Window Zamil 1.5TR SEER 6.51'),
('Window','Frego','FT18X-2A5','Non-Inverter','1.5',1.51,18200,1850,9.8378378378378386,15390,2160,7.125,8.379999999999999,'Window Frego 1.51TR SEER 8.38','Window Carrier 1.43TR SEER 8.52'),
('Window','Carrier','51HVR213MAOG','Non-Inverter','2',1.75,21000,2100,10,17500,2465,7.0993914807302234,8.4599999999999991,'Window Carrier 1.75TR SEER 8.46','Window York  1.75TR SEER 8.45'),
('Window','Carrier','CRSR243M-OG8','Non-Inverter','2',1.75,21000,2100,10,17500,2465,7.0993914807302234,8.4599999999999991,'Window Carrier 1.75TR SEER 8.46','Window York  1.75TR SEER 8.45'),
('Window','York','YE7WL24EC841-0','Non-Inverter','2',1.83,22000,2172,10.128913443830571,17750,2515,7.0576540755467194,8.51,'Window York 1.83TR SEER 8.51','Window York  1.75TR SEER 8.45'),
('Window','Classic','PCB24CIXQIINW','Non-Inverter','2',2,24000,3200,7.5,19000,3520,5.3977272727272725,6.34,'Window Classic 2TR SEER 6.34','Window Zamil 2TR SEER 6.34'),
('Window','Zamil','ZHB24CGERKINW2','Non-Inverter','2',2,24050,2807,8.5678660491628076,20000,3267,6.1218243036424855,7.26,'Window Zamil 2TR SEER 7.26','Window Zamil 2TR SEER 7.24'),
('Window','Carrier','51HVD243MAOC','Non-Inverter','2',2.0099999999999998,24200,2674,9.0501121914734473,18700,2968,6.3005390835579513,7.58,'Window Carrier 2.01TR SEER 7.58','Window York  2.01TR SEER 7.57'),
('Window','LG','W242EC','Non-Inverter','2',2,24000,2440,9.8360655737704921,16719,2900,5.7651724137931035,7.81,'Window LG 2TR SEER 7.81','Window LG 2TR SEER 7.48'),
('Window','York','AR24HCFNBWKN','Non-Inverter','2',1.93,23200,2340,9.9145299145299148,20230,2700,7.4925925925925929,8.56,'Window York 1.93TR SEER 8.56','Window York  1.75TR SEER 8.45'),
('Window','LG','W242EHSN0','Non-Inverter','2',1.74,20985,2500,8.3940000000000001,18493,2950,6.2688135593220338,7.2299999999999995,'Window LG 1.74TR SEER 7.23','Window LG 1.74TR SEER 7.22'),
('Window','Hotpoint','KRJ24BBS1','Non-Inverter','2',1.8,21717,2750,7.8970909090909087,null,null,null,null,null,'Window York  1.75TR SEER 8.45'),
('Window','York','NYSD243M-0B3','Non-Inverter','2',1.83,22000,2530,8.695652173913043,17504,2820,6.2070921985815604,7.34,'Window York 1.83TR SEER 7.34','Window  Zamil 2TR SEER 7.33'),
('Window','Carrier','CRVD243M-0C','Non-Inverter','2',1.83,22000,2600,8.4615384615384617,17514,2800,6.2549999999999999,7.21,'Window Carrier 1.83TR SEER 7.21','Window LG 1.74TR SEER 7.22'),
('Window','Gree','GJC24AE-D3MTD5A','Non-Inverter','2',1.82,21850,2150,10.162790697674419,18300,2550,7.1764705882352944,8.59,'Window Gree 1.82TR SEER 8.59','Window York  1.75TR SEER 8.45'),
('Window','Carrier','CRSD183M-0B-5','Non-Inverter','1.5',1.54,18500,1897,9.7522403795466523,15000,2143,6.9995333644423701,8.26,'Window Carrier 1.54TR SEER 8.26','Window Carrier 1.43TR SEER 8.52'),
('Window','Gree','GJC18AE-D3NMTB4B','Non-Inverter','1.5',1.61,19400,1960,9.8979591836734695,15800,2200,7.1818181818181817,8.41,'Window Gree 1.61TR SEER 8.41','Window York  1.75TR SEER 8.45'),
('Window','LG','W182BC','Non-Inverter','1.5',1.5,18000,2090,8.6124401913875595,15000,2240,6.6964285714285712,7.46,'Window LG 1.5TR SEER 7.46','Window LG 1.5TR SEER 7.70'),
('Window','General','ANJ18BDS1D','Non-Inverter','1.5',1.5,18000,2100,8.5714285714285712,null,null,null,null,null,'Window Carrier 1.5TR SEER 8.62'),
('Window','York','Nysd183m','Non-Inverter','1.5',1.54,18500,1897,9.7522403795466523,15013.46,2143,7.0058142790480629,8.26,'Window York 1.54TR SEER 8.26','Window Carrier 1.43TR SEER 8.52'),
('Window','AlESSA','DO24E8H3J','Non-Inverter','2',1.78,21458,2490,8.6176706827309228,16822,2740,6.1394160583941604,7.26,'Window AlESSA 1.78TR SEER 7.26','Window Zamil 1.88TR SEER 7.28'),
('Window','Falcon','FCWH 24','Non-Inverter','2',2,24000,2970,8.0808080808080813,null,null,null,null,null,'Window LG 2TR SEER 7.48'),
('Window','York','NYVR243M-0G5','Non-Inverter','2',2,24050,2813,8.5495911837895484,20472,3333,6.142214221422142,7.27,'Window York 2TR SEER 7.27','Window Zamil 2TR SEER 7.24'),
('Window','Zamil','ZHB24CGERIMNW','Non-Inverter','2',1.87,22500,2630,8.5551330798479093,19500,3170,6.1514195583596214,7.2799999999999994,'Window Zamil 1.87TR SEER 7.28','Window Zamil 1.88TR SEER 7.28'),
('Window','Gree','GJC24AE-D3NMTG1D','Non-Inverter','2',1.81,21800,2150,10.13953488372093,18300,2550,7.1764705882352944,8.58,'Window Gree 1.81TR SEER 8.58','Window York  1.75TR SEER 8.45'),
('Window','Mando','AC-24H-WND-MD','Non-Inverter','2',1.7,20400,2042,9.9902056807051913,17400,2429,7.1634417455743105,8.49,'Window Mando 1.7TR SEER 8.49','Window York  1.75TR SEER 8.45'),
('Window','QUEEN','HQWG24H','Non-Inverter','2',1.76,21175,2750,7.7,17750,3200,5.546875,6.54,'Window QUEEN 1.76TR SEER 6.54','Window Zamil 1.79TR SEER 6.38'),
('Window','Falcon','FSVR243M-0G8','Non-Inverter','2',1.75,21000,2100,10,17500,2465,7.0993914807302234,8.4599999999999991,'Window Falcon 1.75TR SEER 8.46','Window York  1.75TR SEER 8.45'),
('Window','Haas','HWA24Y6M','Non-Inverter','2',1.73,20800,2087,9.9664590321034972,17700,2463,7.1863580998781975,8.48,'Window Haas 1.73TR SEER 8.48','Window York  1.75TR SEER 8.45'),
('Window','ARROW','RO-24WHMG','Non-Inverter','2',1.73,20800,2040,10.196078431372548,17700,2424,7.3019801980198018,8.66,'Window ARROW 1.73TR SEER 8.66','Window York  1.75TR SEER 8.45'),
('Window','LG','Z242EH','Non-Inverter','2',1.67,20131,2365,8.5120507399577168,17231,2810,6.1320284697508898,7.24,'Window LG 1.67TR SEER 7.24','Window LG 1.74TR SEER 7.22'),
('Window','Zamil','SHB18CREYIINW','Non-Inverter','1.5',1.5,18000,2200,8.1818181818181817,12600,2300,5.4782608695652177,6.74,'Window Zamil 1.5TR SEER 6.74','Window  Zamil 1.5TR SEER 6.80'),
('Window','Zamil','UHB20CTESIINW','Non-Inverter','1.5',1.58,19000,2100,9.0476190476190474,14500,2400,6.041666666666667,7.4799999999999995,'Window Zamil 1.58TR SEER 7.48','Window LG 1.5TR SEER 7.70'),
('Window','LG','Z182EH','Non-Inverter','1.5',1.49,17948,2110,8.506161137440758,15116,2460,6.1447154471544714,7.24,'Window LG 1.49TR SEER 7.24','Window LG 1.49TR SEER 7.24'),
('Window','AlESSA','H019E8H3Y','Non-Inverter','1.5',1.43,17265,1960,8.808673469387756,14331,2340,6.1243589743589739,7.41,'Window AlESSA 1.43TR SEER 7.41','Window LG 1.49TR SEER 7.24'),
('Split_Wall_Mounted','LG','S122SH / GS-H122E0B1','Non-Inverter','1',0.95,11498.436167187945,1200,9.5820301393232867,10235.996588001137,1400,7.3114261342865259,8.31,'Split_Wall_Mounted LG 0.95TR SEER 8.31','Split_Wall_Mounted LG 0.95TR SEER 8.3'),
('Split_Wall_Mounted','Carrier','42QHF012H','Non-Inverter','1',0.95,11500,940,12.23404255319149,9700,1110,8.7387387387387392,10.37,'Split_Wall_Mounted Carrier 0.95TR SEER 10.37','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Chigo','CZS-18CH','Non-Inverter','1.5',1.38,16675,1450,11.5,14362,1670,8.6,9.89,'Split_Wall_Mounted Chigo 1.38TR SEER 9.89','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','York','YE6HC18SH/YE6SD180SHZW41','Non-Inverter','1.5',1.42,17040,1478,11.529093369418133,15097,1819,8.2996151731720733,9.84,'Split_Wall_Mounted York 1.42TR SEER 9.84','Split_Wall_Mounted York 1.42TR SEER 9.83'),
('Split_Wall_Mounted','LG','B1828H N51','Non-Inverter','1.5',1.45,17469.434176855277,1510,11.569161706526673,14978.675007108332,1800,8.3214861150601838,9.84,'Split_Wall_Mounted LG 1.45TR SEER 9.84','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','LG','S182DC u51','Non-Inverter','1.5',1.45,17500,2000,8.75,15300,2300,6.6521739130434785,7.5699999999999994,'Split_Wall_Mounted LG 1.45TR SEER 7.57','Split_Wall_Mounted LG 1.46TR SEER 7.56'),
('Split_Wall_Mounted','LG','S182SC / LSUC1825SB0','Non-Inverter','1.5',1.45,17503,2050,8.538048780487804,15183,2450,6.1971428571428575,7.29,'Split_Wall_Mounted LG 1.45TR SEER 7.29','Split_Wall_Mounted LG 1.46TR SEER 7.28'),
('Split_Wall_Mounted','LG','S182DC N51','Non-Inverter','1.5',1.45,17503.554165481946,2000,8.7517770827409738,15353.994882001707,2300,6.6756499486963943,7.58,'Split_Wall_Mounted LG 1.45TR SEER 7.58','Split_Wall_Mounted LG 1.46TR SEER 7.57'),
('Split_Wall_Mounted','LG','A1828P nco','Non-Inverter','1.5',1.45,17503.554165481946,1520,11.515496161501281,15012.794995735005,1810,8.2943618760966871,9.7999999999999989,'Split_Wall_Mounted LG 1.45TR SEER 9.8','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','LG','T182NC NC0 / LS Q182CNC0','Non-Inverter','1.5',1.47,17742,1500,11.827999999999999,15286,1740,8.7850574712643681,10.15,'Split_Wall_Mounted LG 1.47TR SEER 10.15','Split_Wall_Mounted LG 1.47TR SEER 10.15'),
('Split_Wall_Mounted','Ugine','UASG18H','Non-Inverter','1.5',1.48,17800,1465,12.150170648464163,14500,1696,8.5495283018867916,10.24,'Split_Wall_Mounted Ugine 1.48TR SEER 10.24','Split_Wall_Mounted Ugine 1.48TR SEER 10.23'),
('Split_Wall_Mounted','Zamil','MAZ18CCXAD1','Non-Inverter','1.5',1.49,17998.294000568669,1440,12.498815278172687,15899.914700028436,1849,8.5991967009347956,10.53,'Split_Wall_Mounted Zamil 1.49TR SEER 10.53','Split_Wall_Mounted Zamil 1.49TR SEER 10.52'),
('Split_Wall_Mounted','Zamil','ADO18CHX0D','Non-Inverter','1.5',1.49,17998.294000568669,1379,13.051699782863428,15295.990901336367,1700,8.9976417066684515,10.97,'Split_Wall_Mounted Zamil 1.49TR SEER 10.97','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','LG','NF182H2','Inverter','1.5',1.5,18000,1452,12.396694214876034,15300,1759,8.6981239340534398,10.47,'Split_Wall_Mounted LG 1.5TR SEER 10.47','Inverter unit "No replacement"'),
('Split_Wall_Mounted','General','GC-18KFC','Non-Inverter','1.5',1.5,18000,1500,12,15500,1824,8.4978070175438596,10.17,'Split_Wall_Mounted General 1.5TR SEER 10.17','Split_Wall_Mounted General 1.5TR SEER 10.16'),
('Split_Wall_Mounted','Mando','MP-SER-18C','Non-Inverter','1.5',1.5,18000,1469,12.253233492171546,15500,1802,8.6015538290788012,10.36,'Split_Wall_Mounted Mando 1.5TR SEER 10.36','Split_Wall_Mounted Mando 1.5TR SEER 10.35'),
('Split_Wall_Mounted','Unix','Omr/split 18H','Non-Inverter','1.5',1.5,18000,1500,12,15500,1824,8.4978070175438596,10.17,'Split_Wall_Mounted Unix 1.5TR SEER 10.17','Split_Wall_Mounted General 1.5TR SEER 10.16'),
('Split_Wall_Mounted','Royal_Temp','MIS-180-HP','Non-Inverter','1.5',1.5,18000,2045,8.8019559902200495,15732,2280,6.9,7.67,'Split_Wall_Mounted Royal_Temp 1.5TR SEER 7.67','Split_Wall_Mounted Royal Temp 1.5TR SEER 7.67'),
('Split_Wall_Mounted','Carrier','42SXC180','Non-Inverter','1.5',1.5,18000,1379,13.052936910804931,15000,1667,8.9982003599280151,10.95,'Split_Wall_Mounted Carrier 1.5TR SEER 10.95','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Gree','GWC18MC','Non-Inverter','1.5',1.5,18083,2250,8.036888888888889,16200,2550,6.3529411764705879,7.04,'Split_Wall_Mounted Gree 1.5TR SEER 7.04','Split_Wall_Mounted Gree 1.5TR SEER 7.03'),
('Split_Wall_Mounted','Zamil','TAL18CHXED','Non-Inverter','1.5',1.5,18100,1496,12.098930481283423,15470,1800,8.594444444444445,10.26,'Split_Wall_Mounted Zamil 1.5TR SEER 10.26','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','LG','Y182SH / GS-H1825SA4','Non-Inverter','1.5',1.52,18254.193915268694,1900,9.6074704817203642,15183.394938868356,2200,6.9015431540310708,8.15,'Split_Wall_Mounted LG 1.52TR SEER 8.15','Split_Wall_Mounted LG 1.52TR SEER 8.15'),
('Split_Wall_Mounted','LG','Y182NH / GS-H1825SA4','Non-Inverter','1.5',1.52,18254.193915268694,1900,9.6074704817203642,15183.394938868356,2200,6.9015431540310708,8.15,'Split_Wall_Mounted LG 1.52TR SEER 8.15','Split_Wall_Mounted LG 1.52TR SEER 8.15'),
('Split_Wall_Mounted','LG','S18TQC / HSNC186C4B0','Non-Inverter','1.5',1.53,18400,1919,9.5883272537780098,16200,2218,7.3038773669972947,8.2999999999999989,'Split_Wall_Mounted LG 1.53TR SEER 8.3','Split_Wall_Mounted LG 1.53TR SEER 8.30'),
('Split_Wall_Mounted','Okia','OKA-18CJ','Non-Inverter','1.5',1.53,18400,1510,12.185430463576159,15800,1800,8.7777777777777786,10.37,'Split_Wall_Mounted Okia 1.53TR SEER 10.37','Split_Wall_Mounted Okia 1.53TR SEER 10.37'),
('Split_Wall_Mounted','LG','Y182SC / GS-C1825SA4','Non-Inverter','1.5',1.54,18561,1950,9.5184615384615388,16036,2300,6.9721739130434779,8.14,'Split_Wall_Mounted LG 1.54TR SEER 8.14','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','Daikin','RY18HEVLK / FTY18HEVLK','Non-Inverter','1.5',1.55,18650,2260,8.2522123893805315,16100,2630,6.1216730038022815,7.08,'Split_Wall_Mounted Daikin 1.55TR SEER 7.08','Split_Wall_Mounted Daikin 1.55TR SEER 7.08'),
('Split_Wall_Mounted','LG','Y242NH / GS-H2425SA4','Non-Inverter','2',1.74,20949.673016775661,2200,9.5225786439889362,18254.193915268694,2550,7.1585074177524293,8.2099999999999991,'Split_Wall_Mounted LG 1.74TR SEER 8.21','Split_Wall_Mounted LG 1.74TR SEER 8.20'),
('Split_Wall_Mounted','LG','B2427H / DSNH24257B1','Non-Inverter','2',1.74,20949.673016775661,1820,11.510809349876737,18936.593687802106,2280,8.3055235472816253,9.84,'Split_Wall_Mounted LG 1.74TR SEER 9.84','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','LG','Y242SH N54','Non-Inverter','2',1.74,20949.673016775661,2200,9.5225786439889362,18254.193915268694,2550,7.1585074177524293,8.2099999999999991,'Split_Wall_Mounted LG 1.74TR SEER 8.21','Split_Wall_Mounted LG 1.74TR SEER 8.20'),
('Split_Wall_Mounted','ARROW','RO-24CBA22-H','Non-Inverter','2',1.75,21000,1710,12.280701754385966,17900,2060,8.6893203883495147,10.4,'Split_Wall_Mounted ARROW 1.75TR SEER 10.4','Split_Wall_Mounted Arrow 1.75TR SEER 10.39'),
('Split_Wall_Mounted','Giant','GIANT-24C','Non-Inverter','2',1.75,21000,1750,12,18900,2100,9,10.36,'Split_Wall_Mounted Giant 1.75TR SEER 10.36','Split_Wall_Mounted Giant 1.75TR SEER 10.36'),
('Split_Wall_Mounted','Carrier','38HQR24US30-04','Non-Inverter','2',1.75,21000,2400,8.75,18500,2700,6.8518518518518521,7.63,'Split_Wall_Mounted Carrier 1.75TR SEER 7.63','Split_Wall_Mounted Carrier 1.75TR SEER 7.63'),
('Split_Wall_Mounted','LG','S242DC N51','Non-Inverter','2',1.79,21495.592834802388,2500,8.5982371339209553,18765.993744668755,3000,6.2553312482229178,7.35,'Split_Wall_Mounted LG 1.79TR SEER 7.35','Split_Wall_Mounted Carrier 1.79TR SEER 8.31'),
('Split_Wall_Mounted','Crown','CROWN 24C','Non-Inverter','2',1.79,21500,1770,12.146892655367232,18600,2130,8.7323943661971839,10.34,'Split_Wall_Mounted Crown 1.79TR SEER 10.34','Split_Wall_Mounted Crown 1.79TR SEER 10.33'),
('Split_Wall_Mounted','Carrier','38MQR18US33-04','Non-Inverter','2',1.79,21500,2240,9.5982142857142865,19000,2600,7.3076923076923075,8.31,'Split_Wall_Mounted Carrier 1.79TR SEER 8.31','Split_Wall_Mounted Carrier 1.79TR SEER 8.31'),
('Split_Wall_Mounted','Carrier','38HKR24US30-04','Non-Inverter','2',1.81,21750,2400,9.0625,19500,2750,7.0909090909090908,7.91,'Split_Wall_Mounted Carrier 1.81TR SEER 7.91','Split_Wall_Mounted Carrier 1.81TR SEER 7.91'),
('Split_Wall_Mounted','LG','B242PC','Non-Inverter','2',1.82,21870.912709695767,1900,11.511006689313561,18970.713676428772,2290,8.2841544438553587,9.7999999999999989,'Split_Wall_Mounted LG 1.82TR SEER 9.8','Split_Wall_Mounted LG 1.99TR SEER 9.80'),
('Split_Wall_Mounted','Zamil','MLZ24CHIXFTR','Non-Inverter','2',1.83,21997.156667614447,2558,8.5993575713895414,19499.573500142167,2868,6.7990144700635176,7.52,'Split_Wall_Mounted Zamil 1.83TR SEER 7.52','Split_Wall_Mounted Zamil 1.83TR SEER 7.51'),
('Split_Wall_Mounted','LG','NS242H2','Non-Inverter','2',1.83,22000,1818,12.101210121012102,18500,2127,8.6976962858486129,10.28,'Split_Wall_Mounted LG 1.83TR SEER 10.28','Split_Wall_Mounted LG 1.83TR SEER 10.27'),
('Split_Wall_Mounted','Gree','GWC24AGE-D3NTA1A/O','Non-Inverter','2',1.83,22000,1818,12.101210121012102,18300,2178,8.4022038567493116,10.17,'Split_Wall_Mounted Gree 1.83TR SEER 10.17','Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','Super_General','KSGS245GER','Non-Inverter','2',1.83,22000,1781,12.352610892756879,18400,2114,8.7038789025543988,10.43,'Split_Wall_Mounted Super_General 1.83TR SEER 10.43','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Carrier','42SKC243-2S','Non-Inverter','2',1.83,22000,1833,12.002182214948173,18500,2229,8.299685957828622,10.09,'Split_Wall_Mounted Carrier 1.83TR SEER 10.09','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Mando','MP-NF23-24C/H','Non-Inverter','2',1.84,22100,1804,12.250554323725055,18500,2189,8.4513476473275464,10.29,'Split_Wall_Mounted Mando 1.84TR SEER 10.29','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','Midea','MSTEP24CRNAG2','Non-Inverter','2',1.84,22100,1804,12.250554323725055,18500,2189,8.4513476473275464,10.29,'Split_Wall_Mounted Midea 1.84TR SEER 10.29','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','Carrier','38HVBS024-3032B','Non-Inverter','2',1.84,22100,1830,12.076502732240437,19300,2320,8.318965517241379,10.17,'Split_Wall_Mounted Carrier 1.84TR SEER 10.17','Split_Wall_Mounted Carrier 1.84TR SEER 10.16'),
('Split_Wall_Mounted','Fisher','FSAC-FT24CERAN','Non-Inverter','2',1.91,23000,1917,11.997913406364111,19800,2329,8.5015027908973817,10.17,'Split_Wall_Mounted Fisher 1.91TR SEER 10.17','Split_Wall_Mounted Carrier 1.84TR SEER 10.16'),
('Split_Wall_Mounted','Carrier','38PQR24US33-08','Non-Inverter','2',1.91,23000,1991,11.551983927674536,20000,2410,8.2987551867219924,9.84,'Split_Wall_Mounted Carrier 1.91TR SEER 9.84','Split_Wall_Mounted Carrier 1.92TR SEER 9.83'),
('Split_Wall_Mounted','Carrier','38PQS24US33-01','Non-Inverter','2',1.91,23000,1990,11.557788944723619,20000,2410,8.2987551867219924,9.84,'Split_Wall_Mounted Carrier 1.91TR SEER 9.84','Split_Wall_Mounted Carrier 1.92TR SEER 9.83'),
('Split_Wall_Mounted','Carrier','42QHMT24N-308J','Non-Inverter','2',1.91,23000,1991,11.551983927674536,20000,2410,8.2987551867219924,9.84,'Split_Wall_Mounted Carrier 1.91TR SEER 9.84','Split_Wall_Mounted Carrier 1.92TR SEER 9.83'),
('Split_Wall_Mounted','Zamil','ADX24EHAXFQ','Non-Inverter','2',1.95,23491,2975,7.8961344537815128,18994,3325,5.7124812030075187,6.7,'Split_Wall_Mounted Zamil 1.95TR SEER 6.7','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Zamil','ADU24CHAXFV','Non-Inverter','2',1.95,23498.436167187945,2460,9.5522098240601405,20100.085299971568,2935,6.8484106643855425,8.1199999999999992,'Split_Wall_Mounted Zamil 1.95TR SEER 8.12','Split_Wall_Mounted Zamil 1.95TR SEER 8.11'),
('Split_Wall_Mounted','LG','A3024HNV0','Non-Inverter','2',1.99,23986.352004549335,2080,11.53190000218718,20779.07307364231,2510,8.2785151687817962,9.81,'Split_Wall_Mounted LG 1.99TR SEER 9.81','Split_Wall_Mounted LG 1.99TR SEER 9.80'),
('Split_Wall_Mounted','Zamil','ADO24CHXOW','Non-Inverter','2',1.99,23996.588001137334,2078,11.547924928362528,19299.075152000001,2325,8.3006774847311835,9.77,'Split_Wall_Mounted Zamil 1.99TR SEER 9.77','Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','Zamil','KRC24CDMHJOW','Non-Inverter','2',1.99,23996.588001137334,2078,11.547924928362528,19298.265567244809,2325,8.3003292762343257,9.77,'Split_Wall_Mounted Zamil 1.99TR SEER 9.77','Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','LG','S242WQ / LSUH2425WM1','Non-Inverter','2',2,24000,2600,9.2307692307692299,19653,2840,6.9200704225352112,7.91,'Split_Wall_Mounted LG 2TR SEER 7.91','Split_Wall_Mounted Carrier 1.81TR SEER 7.91'),
('Split_Wall_Mounted','Daewoo','DSA-240LH-R','Non-Inverter','2',2,24000,2500,9.6,17496.730167756614,2800,6.2488322027702194,7.8599999999999994,'Split_Wall_Mounted Daewoo 2TR SEER 7.86','Split_Wall_Mounted DAEWOO 2TR SEER 7.86'),
('Split_Wall_Mounted','Royal_Temp','MIS-240-HP','Non-Inverter','2',2,24000,2727,8.8008800880088014,20064,2907,6.9019607843137258,7.64,'Split_Wall_Mounted Royal_Temp 2TR SEER 7.64','Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','Carrier','42QCF02433','Non-Inverter','2',2,24000,2450,9.795918367346939,21000,2650,7.9245283018867925,8.61,'Split_Wall_Mounted Carrier 2TR SEER 8.61','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','Zamil','KRZ26CDACIED','Non-Inverter','2',2,24055,1935,12.431524547803617,19960,2353,8.4827879303017433,10.4,'Split_Wall_Mounted Zamil 2TR SEER 10.4','Split_Wall_Mounted Zamil 2TR SEER 10.39'),
('Split_Wall_Mounted','Mitsubishi','PK-2.5FLD','Non-Inverter','2',2.0299999999999998,24400,3010,8.1063122923588047,22700,3540,6.4124293785310735,7.12,'Split_Wall_Mounted Mitsubishi 2.03TR SEER 7.12','Split_Wall_Mounted Zamil 1.95TR SEER 8.11'),
('Split_Wall_Mounted','Zamil','MWZ30CHIXFTQ/KZC30CSIHAMCQ','Non-Inverter','2',2.11,25398.91953369349,3050,8.3275146012109804,21997.156667614447,3375,6.5176760496635398,7.25,'Split_Wall_Mounted Zamil 2.11TR SEER 7.25','Split_Wall_Mounted LG 2.21TR SEER 8.14'),
('Split_Wall_Mounted','Zamil','HWU30EHAYFV','Non-Inverter','2',2.12,25497.867500710836,2670,9.5497631088804624,21099.800966733015,3080,6.8505847294587712,8.1,'Split_Wall_Mounted Zamil 2.12TR SEER 8.1','Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','Gree','GWC30QE-D3NTN4A/I','Non-Inverter','2',2.19,26300,2230,11.79372197309417,22800,2680,8.5074626865671643,10.049999999999999,'Split_Wall_Mounted Gree 2.19TR SEER 10.05','Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','LG','S3228Q / LS-H322V8C2','Non-Inverter','2',2.21,26613.59112880296,2790,9.5389215515422805,23713.392095535972,3450,6.8734469842133255,8.14,'Split_Wall_Mounted LG 2.21TR SEER 8.14','Split_Wall_Mounted LG 2.21TR SEER 8.14'),
('Split_Wall_Mounted','LG','S3224H NV2','Non-Inverter','2',2.21,26613.59112880296,2790,9.5389215515422805,23713.392095535968,3450,6.8734469842133237,8.14,'Split_Wall_Mounted LG 2.21TR SEER 8.14','Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','Zamil','ADO30CHXCD','Non-Inverter','2',2.2400000000000002,26954.791015069663,2195,12.280087022810781,23798.692067102642,2800,8.4995328811080864,10.36,'Split_Wall_Mounted Zamil 2.24TR SEER 10.36','Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','LG','S322GC SD3','Non-Inverter','2',2.2400000000000002,26988.911003696332,3210,8.4077604372885766,23747.512084162638,3690,6.4356401312093867,7.29,'Split_Wall_Mounted LG 2.24TR SEER 7.29','Split_Wall_Mounted LG 2.25TR SEER 7.28'),
('Split_Wall_Mounted','Gree','GWC30QF-S3DTB2A/O','Non-Inverter','2',2.25,27000,2080,12.98076923076923,23200,2430,9.5473251028806576,11.11,'Split_Wall_Mounted Gree 2.25TR SEER 11.11','Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','Okia','OKA-30CH','Non-Inverter','2',2.25,27000,2160,12.5,23200,2620,8.8549618320610683,10.59,'Split_Wall_Mounted Okia 2.25TR SEER 10.59','Split_Wall_Mounted Okia 2.25TR SEER 10.59'),
('Split_Wall_Mounted','LG','ATNQ30GPLT4','Inverter','2',2.25,27000,2180,12.385321100917432,24000,2760,8.695652173913043,10.5,'Split_Wall_Mounted LG 2.25TR SEER 10.5','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Carrier','42QTD024VS','Non-Inverter','2',2.25,27000,2250,12,24000,2810,8.5409252669039137,10.209999999999999,'Split_Wall_Mounted Carrier 2.25TR SEER 10.21','Split_Wall_Mounted Carrier 2.25TR SEER 10.20'),
('Split_Wall_Mounted','Fuji','RSA30FRTA-S','Non-Inverter','2',2.29,27500,2700,10.185185185185185,24000,3290,7.2948328267477205,8.67,'Split_Wall_Mounted Fuji 2.29TR SEER 8.67','Split_Wall_Mounted Fuji 2.2TR SEER 8.66'),
('Split_Wall_Mounted','LG','T3224H / AS-W322V4B0','Non-Inverter','2.5',2.33,27978.390673869773,2320,12.059651152530074,24600.511799829401,2650,9.2832119999356237,10.47,'Split_Wall_Mounted LG 2.33TR SEER 10.47','Split_Wall_Mounted LG 2.33TR SEER 10.46'),
('Split_Wall_Mounted','LG','T3224C / AS-Q322V4B0','Inverter','2.5',2.33,27978.390673869777,2240,12.490352979406151,22382.712539095821,2510,8.9174153542214434,10.549999999999999,'Split_Wall_Mounted LG 2.33TR SEER 10.55','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Samsung','AR30JVFUCWKX','Non-Inverter','2.5',2.33,28000,2430,11.522633744855968,25000,3010,8.3056478405315612,9.84,'Split_Wall_Mounted Samsung 2.33TR SEER 9.84','Split_Wall_Mounted Samsung 2.33TR SEER 9.83'),
('Split_Wall_Mounted','Zamil','ADO30CHXCW','Non-Inverter','2.5',2.35,28295.706568097812,2450,11.549267986978698,25296.559567813478,3048,8.2993961836658396,9.86,'Split_Wall_Mounted Zamil 2.35TR SEER 9.86','Split_Wall_Mounted Zamil 2.35TR SEER 9.85'),
('Split_Wall_Mounted','LG','NT382H / S4-W32R43FA','Non-Inverter','2.5',2.5,30000,2440,12.295081967213115,25400,2885,8.8041594454072793,10.44,'Split_Wall_Mounted LG 2.5TR SEER 10.44','Split_Wall_Mounted LG 2.5TR SEER 10.43'),
('Split_Wall_Mounted','Royal_Temp','MIS-300-HP','Non-Inverter','2.5',2.5,30000,3448,8.700696055684455,24396,3587,6.8012266517981601,7.5299999999999994,'Split_Wall_Mounted Royal_Temp 2.5TR SEER 7.53','Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Wall_Mounted','Carrier','42QHB030HS','Non-Inverter','2.5',2.58,31000,2520,12.301587301587302,26500,3050,8.6885245901639347,10.41,'Split_Wall_Mounted Carrier 2.58TR SEER 10.41','Split_Wall_Mounted Carrier 2.58TR SEER 10.41'),
('Split_Wall_Mounted','LG','T3624C / AS-Q362V4V0','Non-Inverter','2.5',2.58,31015.069661643443,2710,11.44467515189795,24805.231731589425,2960,8.3801458552666972,9.73,'Split_Wall_Mounted LG 2.58TR SEER 9.73','Split_Wall_Mounted LG 2.58TR SEER 9.72'),
('Split_Wall_Mounted','LG','T3624H / AS-W362V4V0','Non-Inverter','2.5',2.58,31015.069661643443,2720,11.402599140310089,24771.111742962756,2920,8.4832574462201222,9.73,'Split_Wall_Mounted LG 2.58TR SEER 9.73','Split_Wall_Mounted LG 2.58TR SEER 9.73'),
('Split_Wall_Mounted','LG','S382GH / LS-H382DSB0','Non-Inverter','2.5',2.6,31219.789593403468,3800,8.2157341035272289,27466.590844469723,4220,6.5086708162250533,7.1899999999999995,'Split_Wall_Mounted LG 2.6TR SEER 7.19','Split_Wall_Mounted LG 2.6TR SEER 7.18'),
('Split_Wall_Mounted','LG','S3624H NV2','Non-Inverter','2.5',2.61,31390.389536536819,3300,9.5122392534960056,28319.590560136479,4130,6.8570437191613749,8.129999999999999,'Split_Wall_Mounted LG 2.61TR SEER 8.13','Split_Wall_Mounted LG 2.62TR SEER 8.13'),
('Split_Wall_Mounted','Royal_Temp','MIS-320-HP','Non-Inverter','2.5',2.66,32000,3720,8.6021505376344081,26380,3937,6.7005334010668021,7.45,'Split_Wall_Mounted Royal_Temp 2.66TR SEER 7.45','Split_Wall_Mounted Royal Temp 2.67TR SEER 7.44'),
('Split_Wall_Mounted','Carrier','38XP100H3PE/ 42XP100H3PE','Non-Inverter','3',2.75,33000,3309.9297893681041,9.9700000000000006,29500,4057.7716643741405,7.27,8.5399999999999991,'Split_Wall_Mounted Carrier 2.75TR SEER 8.54','Split_Wall_Mounted Carrier 2.75TR SEER 8.54'),
('Split_Wall_Mounted','Carrier','38XP100H3-E','Non-Inverter','3',2.75,33000,3200,10.3125,29500,3950,7.4683544303797467,8.82,'Split_Wall_Mounted Carrier 2.75TR SEER 8.82','Split_Wall_Mounted Carrier 2.75TR SEER 8.81'),
('Split_Wall_Mounted','Daikin','FTY24HEVLK','Non-Inverter','2',1.77,21350,2470,8.6437246963562746,18330,2770,6.6173285198555956,7.4799999999999995,'Split_Wall_Mounted Daikin 1.77TR SEER 7.48','Split_Wall_Mounted Daikin 1.78TR SEER 7.47'),
('Split_Wall_Mounted','Daikin','R30KEVLK / FT30KEVLK','Non-Inverter','2',2.27,27300,2750,9.9272727272727277,24000,3200,7.5,8.57,'Split_Wall_Mounted Daikin 2.27TR SEER 8.57','Split_Wall_Mounted Daikin 2.28TR SEER 8.57'),
('Split_Wall_Mounted','Carrier','42XP100HP3P','Non-Inverter','3',2.78,33438,3920.0468933177026,8.5299999999999994,29500,4097.2222222222226,7.1999999999999993,7.58,'Split_Wall_Mounted Carrier 2.78TR SEER 7.58','Split_Wall_Mounted Carrier 2.75TR SEER 8.54'),
('Split_Wall_Mounted','Samsung','AS18FCN','Non-Inverter','1.5',1.5,18000,1900,9.473684210526315,15300,2250,6.8,8.0499999999999989,'Split_Wall_Mounted Samsung 1.5TR SEER 8.05','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','LG','S182NH','Non-Inverter','1.5',1.5,18000,1900,9.473684210526315,15593,2040,7.6436274509803921,8.31,'Split_Wall_Mounted LG 1.5TR SEER 8.31','Split_Wall_Mounted LG 1.53TR SEER 8.30'),
('Split_Wall_Mounted','Mando','S-036H/S','Non-Inverter','2',2.2999999999999998,27600,2400,11.5,23900,2880,8.2986111111111107,9.7999999999999989,'Split_Wall_Mounted Mando 2.3TR SEER 9.8','Split_Wall_Mounted Samsung 2.33TR SEER 9.83'),
('Split_Wall_Mounted','Sky star','SKYSTARL-18C','Non-Inverter','1.5',1.49,17913,1480,12.103378378378379,15354,1760,8.723863636363637,10.299999999999999,'Split_Wall_Mounted Sky star 1.49TR SEER 10.3','Split_Wall_Mounted Mando 1.5TR SEER 10.35'),
('Split_Wall_Mounted','Champion','CHSSI-24C','Non-Inverter','2',1.84,22178,2266.8919270833335,9.7834394904458595,19637.60683760684,2733.2484694186828,7.1847133757961776,8.39,'Split_Wall_Mounted Champion 1.84TR SEER 8.39','Split_Wall_Mounted Carrier 1.79TR SEER 8.31'),
('Split_Wall_Mounted','Mando','S-030H/S','Non-Inverter','2',2,24000,2080,11.538461538461538,20500,2380,8.6134453781512601,9.91,'Split_Wall_Mounted Mando 2TR SEER 9.91','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Mando','KT3F-61GW/S','Non-Inverter','2',1.73,20800,1800,11.555555555555555,16700,2000,8.35,9.7899999999999991,'Split_Wall_Mounted Mando 1.73TR SEER 9.79','Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','Mando','S030-HS','Non-Inverter','2',2,24000,2080,11.538461538461538,20500,2380,8.6134453781512601,9.91,'Split_Wall_Mounted Mando 2TR SEER 9.91','Split_Wall_Mounted Carrier 1.92TR SEER 9.83'),
('Split_Wall_Mounted','Haam','HM24CSM23GO','Non-Inverter','2',1.83,22000,1818,12.101210121012102,19400,2230,8.6995515695067258,10.32,'Split_Wall_Mounted Haam 1.83TR SEER 10.32','Split_Wall_Mounted Crown 1.79TR SEER 10.33'),
('Split_Wall_Mounted','TIT','TIS18CG','Non-Inverter','1.5',1.5,18053,1529,11.807063440156965,15630,1801,8.6785119378123259,10.11,'Split_Wall_Mounted TIT 1.5TR SEER 10.11','Split_Wall_Mounted LG 1.47TR SEER 10.15'),
('Split_Wall_Mounted','Master_Cool','CSA-18CH','Non-Inverter','1.5',1.44,17388,1950,8.9169230769230765,15384.615384615387,2250,6.8376068376068382,7.74,'Split_Wall_Mounted Master_Cool 1.44TR SEER 7.74','Split_Wall_Mounted Royal Temp 1.5TR SEER 7.67'),
('Split_Wall_Mounted','LG','S242DC','Non-Inverter','2',1.79,21496,2500,8.5983999999999998,18766,3000,6.2553333333333336,7.35,'Split_Wall_Mounted LG 1.79TR SEER 7.35','Split_Wall_Mounted LG 1.79TR SEER 7.34'),
('Split_Wall_Mounted','Haam','KFR-51GW/a','Non-Inverter','1.5',1.45,17400,1950,8.9230769230769234,15300,2250,6.8,7.7299999999999995,'Split_Wall_Mounted Haam 1.45TR SEER 7.73','Split_Wall_Mounted Royal Temp 1.5TR SEER 7.67'),
('Split_Wall_Mounted','Haas','HSA25CE6HM7','Non-Inverter','2',1.79,21500,1820,11.813186813186814,18300,2180,8.3944954128440372,10.01,'Split_Wall_Mounted Haas 1.79TR SEER 10.01','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','Samsung','AQ24UUPN','Non-Inverter','2',2,24000,2600,9.2307692307692299,19841,2900,6.8417241379310347,7.89,'Split_Wall_Mounted Samsung 2TR SEER 7.89','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','ARROW','RO-18JC','Non-Inverter','1.5',1.53,18400,1510,12.185430463576159,15800,1800,8.7777777777777786,10.37,'Split_Wall_Mounted ARROW 1.53TR SEER 10.37','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Mando','MP920-24C','Non-Inverter','2',1.83,22000,1781,12.352610892756879,18200,2128,8.5526315789473681,10.37,'Split_Wall_Mounted Mando 1.83TR SEER 10.37','Split_Wall_Mounted Giant 1.75TR SEER 10.36'),
('Split_Wall_Mounted','Haam','HM18CSM20','Non-Inverter','1.5',1.5,18000,1469,12.253233492171546,15200,1747,8.7006296508299936,10.379999999999999,'Split_Wall_Mounted Haam 1.5TR SEER 10.38','Split_Wall_Mounted Okia 1.53TR SEER 10.37'),
('Split_Wall_Mounted','Kelvinator','KMS18H9','Non-Inverter','1.5',1.5,18100,1484,12.196765498652292,15900,1797,8.8480801335559267,10.42,'Split_Wall_Mounted Kelvinator 1.5TR SEER 10.42','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','York','Y4HFXH018BBA--FX','Non-Inverter','1.5',1.45,17500,1800,9.7222222222222214,15500,2115,7.3286052009456268,8.4,'Split_Wall_Mounted York 1.45TR SEER 8.4','Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','LG','S242MHT0','Non-Inverter','2',2,24000,2500,9.6,20063,3035,6.6105436573311369,8.06,'Split_Wall_Mounted LG 2TR SEER 8.06','Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','Gree','STW24KHR','Non-Inverter','2',1.93,23202,2000,11.601000000000001,19899,2390,8.325941422594143,9.86,'Split_Wall_Mounted Gree 1.93TR SEER 9.86','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Midea','MSTF24HR5F3','Non-Inverter','2',1.72,20642,2130,9.6910798122065724,19414.3,2450,7.9242040816326531,8.6,'Split_Wall_Mounted Midea 1.72TR SEER 8.6','Split_Wall_Mounted Carrier 1.79TR SEER 8.31'),
('Split_Wall_Mounted','LG','S242SSHN52','Non-Inverter','2',1.79,21496,2700,7.9614814814814814,18425,3250,5.6692307692307695,6.76,'Split_Wall_Mounted LG 1.79TR SEER 6.76','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Icone','ico-18k/FC','Non-Inverter','1.5',1.42,17060,1420,12.014084507042254,14671,1700,8.6300000000000008,10.220000000000001,'Split_Wall_Mounted Icone 1.42TR SEER 10.22','Split_Wall_Mounted Ugine 1.48TR SEER 10.23'),
('Split_Wall_Mounted','Gree','GWH18MC-D1NTA8G/I','Non-Inverter','1.5',1.46,17600,1796,9.799554565701559,15200,2024,7.5098814229249014,8.48,'Split_Wall_Mounted Gree 1.46TR SEER 8.48','Split_Wall_Mounted LG 1.5TR SEER 8.40')
on conflict (equipment_type, model_no) do update set
  make = excluded.make,
  compressor_type = excluded.compressor_type,
  size_category = excluded.size_category,
  tr = excluded.tr,
  t1_btu = excluded.t1_btu,
  t1_w = excluded.t1_w,
  t1_eer = excluded.t1_eer,
  t3_btu = excluded.t3_btu,
  t3_w = excluded.t3_w,
  t3_eer = excluded.t3_eer,
  equivalent_seer = excluded.equivalent_seer,
  surveyed_unit_description = excluded.surveyed_unit_description,
  equivalent_ac_model_description = excluded.equivalent_ac_model_description
where (t.make, t.compressor_type, t.size_category, t.tr, t.t1_btu, t.t1_w, t.t1_eer, t.t3_btu, t.t3_w, t.t3_eer, t.equivalent_seer, t.surveyed_unit_description, t.equivalent_ac_model_description)
   is distinct from (excluded.make, excluded.compressor_type, excluded.size_category, excluded.tr, excluded.t1_btu, excluded.t1_w, excluded.t1_eer, excluded.t3_btu, excluded.t3_w, excluded.t3_eer, excluded.equivalent_seer, excluded.surveyed_unit_description, excluded.equivalent_ac_model_description);

-- >>> CHUNK 2/11 — old_model_registry rows 201-400 of 1516
insert into public.old_model_registry as t (equipment_type, make, model_no, compressor_type, size_category, tr, t1_btu, t1_w, t1_eer, t3_btu, t3_w, t3_eer, equivalent_seer, surveyed_unit_description, equivalent_ac_model_description) values
('Split_Wall_Mounted','Gree','GWC24ACE-D3NTA1C/I','Non-Inverter','2',1.83,22000,1865,11.796246648793566,18300,2200,8.3181818181818183,9.9599999999999991,'Split_Wall_Mounted Gree 1.83TR SEER 9.96','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','LG','S242KHST2','Non-Inverter','2',2,24000,2450,9.795918367346939,19312,2850,6.7761403508771929,8.2099999999999991,'Split_Wall_Mounted LG 2TR SEER 8.21','Split_Wall_Mounted Zamil 1.95TR SEER 8.11'),
('Split_Wall_Mounted','Fuji','RSA24UMTA-S','Non-Inverter','2',1.88,22600,1960,11.530612244897959,19500,2350,8.2978723404255312,9.82,'Split_Wall_Mounted Fuji 1.88TR SEER 9.82','Split_Wall_Mounted LG 1.99TR SEER 9.80'),
('Split_Wall_Mounted','LG','S182SCN51','Non-Inverter','1.5',1.45,17488,2050,8.5307317073170736,15184,2450,6.197551020408163,7.29,'Split_Wall_Mounted LG 1.45TR SEER 7.29','Split_Wall_Mounted LG 1.46TR SEER 7.28'),
('Split_Wall_Mounted','Speed_Cool','SCSGI180C','Non-Inverter','1.5',1.5,18000,1525,11.803278688524591,14900,1773,8.4038353073886061,9.99,'Split_Wall_Mounted Speed_Cool 1.5TR SEER 9.99','Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','Gree','GWH24QE-D3NTB4D/I','Non-Inverter','2',1.87,22500,1838,12.241566920565832,18900,2228,8.4829443447037693,10.29,'Split_Wall_Mounted Gree 1.87TR SEER 10.29','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','Gree','GWH36QF-D3NTB4G/I','Non-Inverter','2.5',2.65,31800,2650,12,27000,3173,8.5092971950835175,10.16,'Split_Wall_Mounted Gree 2.65TR SEER 10.16','Split_Wall_Mounted Zamil 2.62TR SEER 10.00'),
('Split_Wall_Mounted','LG','A182WPNS2','Non-Inverter','1.5',1.5,18000,1950,9.2307692307692299,16787,2080,8.070673076923077,8.32,'Split_Wall_Mounted LG 1.5TR SEER 8.32','Split_Wall_Mounted LG 1.53TR SEER 8.30'),
('Split_Wall_Mounted','LG','S182SCN52','Non-Inverter','1.5',1.45,17489,2000,8.7445000000000004,15354,2300,6.6756521739130434,7.5699999999999994,'Split_Wall_Mounted LG 1.45TR SEER 7.57','Split_Wall_Mounted LG 1.46TR SEER 7.57'),
('Split_Wall_Mounted','TACHIAIR','TC18C/7S16','Non-Inverter','1.5',1.45,17400,1510,11.523178807947019,14900,1730,8.6127167630057802,9.9,'Split_Wall_Mounted TACHIAIR 1.45TR SEER 9.9','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','LG','B2424HN50','Non-Inverter','2',1.76,21196.581196581199,1830,11.582831254962404,18903,2280,8.2907894736842103,9.8699999999999992,'Split_Wall_Mounted LG 1.76TR SEER 9.87','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Midea','MSTM12CRN','Non-Inverter','1',1.01,12171,1005,12.110447761194029,10161,1187,8.5602358887952814,10.23,'Split_Wall_Mounted Midea 1.01TR SEER 10.23','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Icone','ico-24k/fc','Non-Inverter','2',1.79,21495,1800,11.941666666666666,18425,2150,8.5697674418604652,10.15,'Split_Wall_Mounted Icone 1.79TR SEER 10.15','Split_Wall_Mounted Carrier 1.84TR SEER 10.16'),
('Split_Wall_Mounted','LG','S242NHST0','Non-Inverter','2',1.91,22997,2630,8.7441064638783264,20063,3035,6.6105436573311369,7.55,'Split_Wall_Mounted LG 1.91TR SEER 7.55','Split_Wall_Mounted LG 1.91TR SEER 7.54'),
('Split_Wall_Mounted','LG','S242DHN51','Non-Inverter','2',1.79,21496,2700,7.9614814814814814,18425,3250,5.6692307692307695,6.76,'Split_Wall_Mounted LG 1.79TR SEER 6.76','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Mando','KT3F-51G/S','Non-Inverter','1.5',1.45,17400,1510,11.523178807947019,14900,1730,8.6127167630057802,9.9,'Split_Wall_Mounted Mando 1.45TR SEER 9.9','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','Gree','GWC24QE-D3NTBF/I','Non-Inverter','2',1.83,22000,1880,11.702127659574469,18700,2255,8.2926829268292686,9.91,'Split_Wall_Mounted Gree 1.83TR SEER 9.91','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Frego','FW18Y-2N7','Non-Inverter','1.5',1.49,17913,1480,12.103378378378379,15354,1760,8.723863636363637,10.299999999999999,'Split_Wall_Mounted Frego 1.49TR SEER 10.3','Split_Wall_Mounted Mando 1.5TR SEER 10.35'),
('Split_Wall_Mounted','Haam','HM24CWM7S17','Non-Inverter','2',1.9,22800,1880,12.127659574468085,19220,2210,8.6968325791855197,10.299999999999999,'Split_Wall_Mounted Haam 1.9TR SEER 10.3','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','Haam','HM24CSM22GO','Non-Inverter','2',1.83,22000,1781,12.352610892756879,18200,2128,8.5526315789473681,10.37,'Split_Wall_Mounted Haam 1.83TR SEER 10.37','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Haier','HSU-30LEG13(T3)','Non-Inverter','2.5',2.5,30000,3500,8.5714285714285712,24500,3900,6.2820512820512819,7.3,'Split_Wall_Mounted Haier 2.5TR SEER 7.3','Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Wall_Mounted','Fuji','ROW-24RSD','Non-Inverter','2',1.9,22800,2520,9.0476190476190474,19500,2900,6.7241379310344831,7.76,'Split_Wall_Mounted Fuji 1.9TR SEER 7.76','Split_Wall_Mounted DAEWOO 2TR SEER 7.86'),
('Split_Wall_Mounted','Haam','HM24H/7S15','Non-Inverter','2',1.68,20200,1750,11.542857142857143,17700,2120,8.3490566037735849,9.85,'Split_Wall_Mounted Haam 1.68TR SEER 9.85','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','TIT','TIS-1820 C','Non-Inverter','1.5',1.5,18000,1450,12.413793103448276,15300,1760,8.6931818181818183,10.48,'Split_Wall_Mounted TIT 1.5TR SEER 10.48','Split_Wall_Mounted LG 1.5TR SEER 10.46'),
('Split_Wall_Mounted','LG','S242SH','Non-Inverter','2',1.78,21478,2700,7.9548148148148146,18425,3250,5.6692307692307695,6.75,'Split_Wall_Mounted LG 1.78TR SEER 6.75','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','LG','S182KH','Non-Inverter','1.5',1.5,18000,1900,9.473684210526315,15593,2040,7.6436274509803921,8.31,'Split_Wall_Mounted LG 1.5TR SEER 8.31','Split_Wall_Mounted LG 1.53TR SEER 8.30'),
('Split_Wall_Mounted','LG','S242NH','Non-Inverter','2',1.91,22997,2630,8.7441064638783264,20063,3035,6.6105436573311369,7.55,'Split_Wall_Mounted LG 1.91TR SEER 7.55','Split_Wall_Mounted LG 1.91TR SEER 7.54'),
('Split_Wall_Mounted','Haam','HM18C/7810','Non-Inverter','1.5',1.45,17400,1510,11.523178807947019,14000,1730,8.0924855491329488,9.69,'Split_Wall_Mounted Haam 1.45TR SEER 9.69','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','Union','UI24CV60LOFR','Non-Inverter','2',1.79,21500,1870,11.497326203208557,18000,2169,8.2987551867219924,9.77,'Split_Wall_Mounted Union 1.79TR SEER 9.77','Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','LG','Y242SHN54','Non-Inverter','2',1.74,20950,2200,9.5227272727272734,18254,2550,7.1584313725490194,8.2099999999999991,'Split_Wall_Mounted LG 1.74TR SEER 8.21','Split_Wall_Mounted LG 1.74TR SEER 8.20'),
('Split_Wall_Mounted','RANTIC','OMS24H','Non-Inverter','2',1.83,22000,1850,11.891891891891891,19600,2250,8.7111111111111104,10.199999999999999,'Split_Wall_Mounted RANTIC 1.83TR SEER 10.2','Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','Haas','HSA25FE7HH7X','Non-Inverter','2',1.91,23000,1925,11.948051948051948,19800,2290,8.6462882096069862,10.18,'Split_Wall_Mounted Haas 1.91TR SEER 10.18','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Haas','HSA20FE7HH7X','Non-Inverter','1.5',1.5,18000,1485,12.121212121212121,15600,1785,8.7394957983193269,10.33,'Split_Wall_Mounted Haas 1.5TR SEER 10.33','Split_Wall_Mounted Mando 1.5TR SEER 10.35'),
('Split_Wall_Mounted','Unix','GSDAD24HN','Non-Inverter','2',1.71,20545,1739,11.814261069580219,17577,1827,9.6206896551724146,10.379999999999999,'Split_Wall_Mounted Unix 1.71TR SEER 10.38','Split_Wall_Mounted Giant 1.75TR SEER 10.36'),
('Split_Wall_Mounted','BASIC','BSACL-F24C7','Non-Inverter','2',1.84,22178,1820,12.185714285714285,19107,2200,8.6850000000000005,10.34,'Split_Wall_Mounted BASIC 1.84TR SEER 10.34','Split_Wall_Mounted Crown 1.79TR SEER 10.33'),
('Split_Wall_Mounted','Gree','GWH12AGC-D3NTAIA/I','Non-Inverter','1',0.96,11600,970,11.958762886597938,10000,1170,8.5470085470085468,10.16,'Split_Wall_Mounted Gree 0.96TR SEER 10.16','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','LG','NS182H2NK0','Inverter','1.5',1.5,18000,1452,12.396694214876034,15300,1759,8.6981239340534398,10.47,'Split_Wall_Mounted LG 1.5TR SEER 10.47','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Samsung','AR24HPFNBWKN','Non-Inverter','2',1.93,23200,2340,9.9145299145299148,20230,2700,7.4925925925925929,8.56,'Split_Wall_Mounted Samsung 1.93TR SEER 8.56','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Mando','KT3F-61G/S','Non-Inverter','2',1.73,20800,1800,11.555555555555555,16700,2000,8.35,9.7899999999999991,'Split_Wall_Mounted Mando 1.73TR SEER 9.79','Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','Haam','HM18C/7815','Non-Inverter','1.5',1.45,17400,1510,11.523178807947019,14900,1730,8.6127167630057802,9.9,'Split_Wall_Mounted Haam 1.45TR SEER 9.9','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','Zamil','MA224CHXAD1','Non-Inverter','2',1.83,22000,1781,12.352610892756879,18434.188034188035,2114,8.720051104157065,10.44,'Split_Wall_Mounted Zamil 1.83TR SEER 10.44','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','S242 NH STO','Non-Inverter','2',1.91,22997,2630,8.7441064638783264,20063,3035,6.6105436573311369,7.55,'Split_Wall_Mounted LG 1.91TR SEER 7.55','Split_Wall_Mounted LG 1.91TR SEER 7.54'),
('Split_Wall_Mounted','LG','S242SH N52','Non-Inverter','2',1.79,21496,2700,7.9614814814814814,18425,3250,5.6692307692307695,6.76,'Split_Wall_Mounted LG 1.79TR SEER 6.76','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Fuji','RSA24RAT','Non-Inverter','2',1.88,22600,2520,8.9682539682539684,19500,2900,6.7241379310344831,7.72,'Split_Wall_Mounted Fuji 1.88TR SEER 7.72','Split_Wall_Mounted Royal Temp 2TR SEER 7.64'),
('Split_Wall_Mounted','Dansat','DSA18WC','Non-Inverter','1.5',1.44,17300,1400,12.357142857142858,14700,1680,8.75,10.459999999999999,'Split_Wall_Mounted Dansat 1.44TR SEER 10.46','Split_Wall_Mounted LG 1.5TR SEER 10.46'),
('Split_Wall_Mounted','LG','S242DH N51','Non-Inverter','2',1.79,21496,2700,7.9614814814814814,18425,3250,5.6692307692307695,6.76,'Split_Wall_Mounted LG 1.79TR SEER 6.76','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Dansat','DS1850C','Non-Inverter','1.5',1.45,17400,1470,11.836734693877551,14800,1780,8.3146067415730336,10,'Split_Wall_Mounted Dansat 1.45TR SEER 10','Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','NIKAI','NSAC12136C22','Non-Inverter','1',1.02,12300,1030,11.941747572815533,10800,1250,8.64,10.19,'Split_Wall_Mounted NIKAI 1.02TR SEER 10.19','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Carrier','42XP090H3P','Non-Inverter','2.5',2.37,28551,3160,9.0351265822784814,24500,3398,7.2101236021188937,7.8999999999999995,'Split_Wall_Mounted Carrier 2.37TR SEER 7.9','Split_Wall_Mounted Zamil 2.35TR SEER 9.85'),
('Split_Wall_Mounted','Mando','MP920-36C','Non-Inverter','2.5',2.61,31400,2614,12.012241775057383,26800,3135,8.5486443381180219,10.19,'Split_Wall_Mounted Mando 2.61TR SEER 10.19','Split_Wall_Mounted Zamil 2.62TR SEER 10.00'),
('Split_Wall_Mounted','LG','Y242SH','Non-Inverter','2',1.74,20950,2200,9.5227272727272734,18084,2550,7.091764705882353,8.18,'Split_Wall_Mounted LG 1.74TR SEER 8.18','Split_Wall_Mounted LG 1.74TR SEER 8.17'),
('Split_Wall_Mounted','LG','LS-H242TKA2','Non-Inverter','2',2,24000,2450,9.795918367346939,19278,2850,6.7642105263157895,8.1999999999999993,'Split_Wall_Mounted LG 2TR SEER 8.2','Split_Wall_Mounted Zamil 1.95TR SEER 8.11'),
('Split_Wall_Mounted','Gree','GWH24ACE-D3NTA1B/I','Non-Inverter','2',1.84,22100,1840,12.010869565217391,19100,2213,8.6308178942611846,10.220000000000001,'Split_Wall_Mounted Gree 1.84TR SEER 10.22','Split_Wall_Mounted LG 1.83TR SEER 10.27'),
('Split_Wall_Mounted','Gree','GWH30ACE-D3NTA1D/I','Non-Inverter','2',2.27,27300,2310,11.818181818181818,23000,2705,8.502772643253234,10.039999999999999,'Split_Wall_Mounted Gree 2.27TR SEER 10.04','Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','Carrier','42QHC018-3P','Non-Inverter','1.5',1.5,18000,1895,9.4986807387862804,16500,2260,7.3008849557522124,8.27,'Split_Wall_Mounted Carrier 1.5TR SEER 8.27','Split_Wall_Mounted LG 1.53TR SEER 8.30'),
('Split_Wall_Mounted','York','YORX-18CC','Non-Inverter','1.5',1.49,17913,1480,12.103378378378379,15354,1760,8.723863636363637,10.299999999999999,'Split_Wall_Mounted York 1.49TR SEER 10.3','Split_Wall_Mounted Mando 1.5TR SEER 10.35'),
('Split_Wall_Mounted','LG','S242LC','Non-Inverter','2',2,24000,2350,10.212765957446809,19722,2700,7.3044444444444441,8.65,'Split_Wall_Mounted LG 2TR SEER 8.65','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','Starway','FOSW18CSP','Non-Inverter','1.5',1.43,17200,1470,11.700680272108844,14500,1690,8.5798816568047336,9.99,'Split_Wall_Mounted Starway 1.43TR SEER 9.99','Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','Speed_Cool','SCSG180C','Non-Inverter','1.5',1.5,18000,1525,11.803278688524591,14900,1773,8.4038353073886061,9.99,'Split_Wall_Mounted Speed_Cool 1.5TR SEER 9.99','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Haam','HM18CSM23GO','Non-Inverter','1.5',1.52,18300,1476,12.398373983739837,15900,1807,8.7991145545102381,10.52,'Split_Wall_Mounted Haam 1.52TR SEER 10.52','Split_Wall_Mounted Zamil 1.49TR SEER 10.52'),
('Split_Wall_Mounted','STARWAY','ACSW24KC','Non-Inverter','2',1.91,23000,1855,12.398921832884097,19800,2275,8.7032967032967026,10.48,'Split_Wall_Mounted STARWAY 1.91TR SEER 10.48','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Fuji','FOJ30SCO','Non-Inverter','2',2,24000,2080,11.538461538461538,20500,2380,8.6134453781512601,9.91,'Split_Wall_Mounted Fuji 2TR SEER 9.91','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Haam','HM18CWM7S17','Non-Inverter','1.5',1.53,18400,1560,11.794871794871796,16600,1860,8.9247311827956981,10.209999999999999,'Split_Wall_Mounted Haam 1.53TR SEER 10.21','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Haam','HM30C/7S15','Non-Inverter','2',2,24000,2080,11.538461538461538,20500,2380,8.6134453781512601,9.91,'Split_Wall_Mounted Haam 2TR SEER 9.91','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','TACHIAIR','TC12C/7S16','Non-Inverter','1',1.01,12225,1060,11.533018867924529,10416,1240,8.4,9.84,'Split_Wall_Mounted TACHIAIR 1.01TR SEER 9.84','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','LG','NF122C0','Inverter','1',1,12000,968,12.396694214876034,10000,1150,8.695652173913043,10.45,'Split_Wall_Mounted LG 1TR SEER 10.45','Inverter unit "No replacement"'),
('Split_Wall_Mounted','LG','NS242C3NK1','Inverter','2',1.79,21500,1734,12.399077277970012,18500,2127,8.6976962858486129,10.48,'Split_Wall_Mounted LG 1.79TR SEER 10.48','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Mando','KT3FR-61G/S','Non-Inverter','2',1.68,20200,1750,11.542857142857143,17700,2130,8.3098591549295779,9.84,'Split_Wall_Mounted Mando 1.68TR SEER 9.84','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Haam','HM18C/7S16','Non-Inverter','1.5',1.45,17400,1510,11.523178807947019,14900,1730,8.6127167630057802,9.9,'Split_Wall_Mounted Haam 1.45TR SEER 9.9','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','LG','NV242H1NK0','Inverter','1.5',1.66,20000,1613,12.399256044637323,17000,1954,8.7001023541453435,10.47,'Split_Wall_Mounted LG 1.66TR SEER 10.47','Inverter unit "No replacement"'),
('Split_Wall_Mounted','AUX','AUX24H','Non-Inverter','2',1.84,22178,1820,12.185714285714285,19107,2200,8.6850000000000005,10.34,'Split_Wall_Mounted AUX 1.84TR SEER 10.34','Split_Wall_Mounted Crown 1.79TR SEER 10.33'),
('Split_Wall_Mounted','Zamil','MAZ24CCXAD1','Non-Inverter','2',1.83,22000,1781,12.352610892756879,18434.188034188035,2114,8.720051104157065,10.44,'Split_Wall_Mounted Zamil 1.83TR SEER 10.44','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Mando','KT3FR-36GW/S','Non-Inverter','1',1.01,12225,1050,11.642857142857142,10416,1240,8.4,9.91,'Split_Wall_Mounted Mando 1.01TR SEER 9.91','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Union','UI18CV60L0FR','Non-Inverter','1.5',1.45,17500,1522,11.498028909329829,15000,1796,8.351893095768375,9.81,'Split_Wall_Mounted Union 1.45TR SEER 9.81','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','LG','LS-H242TLB2','Non-Inverter','2',2,24000,2450,9.795918367346939,19278,2850,6.7642105263157895,8.1999999999999993,'Split_Wall_Mounted LG 2TR SEER 8.2','Split_Wall_Mounted Zamil 1.95TR SEER 8.11'),
('Split_Wall_Mounted','LG','Y242NH N04','Non-Inverter','2',1.74,20950,2200,9.5227272727272734,18254,2550,7.1584313725490194,8.2099999999999991,'Split_Wall_Mounted LG 1.74TR SEER 8.21','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','AMAX','SAC12AX','Non-Inverter','1',1.02,12300,1010,12.178217821782178,10600,1260,8.412698412698413,10.25,'Split_Wall_Mounted AMAX 1.02TR SEER 10.25','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Craft','DS18FE7HY7WM','Non-Inverter','1.5',1.47,17650,1525,11.573770491803279,14750,1760,8.3806818181818183,9.84,'Split_Wall_Mounted Craft 1.47TR SEER 9.84','Split_Wall_Mounted LG 1.45TR SEER 9.84'),
('Split_Wall_Mounted','Craft','DS24FE7HY7WM','Non-Inverter','2',1.9,22800,1950,11.692307692307692,19300,2320,8.318965517241379,9.91,'Split_Wall_Mounted Craft 1.9TR SEER 9.91','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Haam','HM18CSM19N','Non-Inverter','1.5',1.5,18000,1488,12.096774193548388,15900,1843,8.6272381985892572,10.29,'Split_Wall_Mounted Haam 1.5TR SEER 10.29','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','Zamil','MRZ24CDGCIAD1','Non-Inverter','2',1.83,22000,1781,12.352610892756879,18434.188034188035,2114,8.720051104157065,10.44,'Split_Wall_Mounted Zamil 1.83TR SEER 10.44','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Mando','KT3F-51GW/S','Non-Inverter','1.5',1.45,17400,1810,9.6132596685082881,14300,1960,7.295918367346939,8.27,'Split_Wall_Mounted Mando 1.45TR SEER 8.27','Split_Wall_Mounted LG 1.53TR SEER 8.30'),
('Split_Wall_Mounted','Starway','SW18KCN','Non-Inverter','1.5',1.43,17244,1437,12,15012,1691,8.8775872264931994,10.299999999999999,'Split_Wall_Mounted Starway 1.43TR SEER 10.3','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','Telezone','TZ18C1','Non-Inverter','1.5',1.44,17300,1430,12.097902097902098,14000,1710,8.1871345029239766,10.08,'Split_Wall_Mounted Telezone 1.44TR SEER 10.08','Split_Wall_Mounted LG 1.47TR SEER 10.15'),
('Split_Wall_Mounted','Zamil','MAZ24GCXAD1.','Non-Inverter','2',1.83,22008.315900000001,1781,12.35728012352611,18220.83828,2128,8.5624240037593982,10.379999999999999,'Split_Wall_Mounted Zamil 1.83TR SEER 10.38','Split_Wall_Mounted Giant 1.75TR SEER 10.36'),
('Split_Wall_Mounted','Ugine','UGNPSM18C-A','Non-Inverter','1.5',1.52,18353,1526,12.026867627785059,16516,1827,9.0399562123700061,10.39,'Split_Wall_Mounted Ugine 1.52TR SEER 10.39','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Zamil','MAZ23CHXAD1','Non-Inverter','2',1.83,22000,1781,12.352610892756879,18400,2114,8.7038789025543988,10.43,'Split_Wall_Mounted Zamil 1.83TR SEER 10.43','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Gree','GWC12ACC-D3NTA1E/I','Non-Inverter','1',1,12000,1005,11.940298507462687,10200,1172,8.7030716723549482,10.19,'Split_Wall_Mounted Gree 1TR SEER 10.19','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Frego','FW18Y2H22','Non-Inverter','1.5',1.44,17300,1430,12.097902097902098,14900,1710,8.7134502923976616,10.299999999999999,'Split_Wall_Mounted Frego 1.44TR SEER 10.3','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','LG','Y242SC','Non-Inverter','2',1.74,20984,2200,9.538181818181819,18254,2600,7.0207692307692309,8.18,'Split_Wall_Mounted LG 1.74TR SEER 8.18','Split_Wall_Mounted LG 1.74TR SEER 8.17'),
('Split_Wall_Mounted','TCL','TAC-30CHS/JC6','Non-Inverter','2',2.04,24500,2110,11.611374407582938,19790,2385,8.2976939203354299,9.82,'Split_Wall_Mounted TCL 2.04TR SEER 9.82','Split_Wall_Mounted LG 1.99TR SEER 9.80'),
('Split_Wall_Mounted','BeSat','BSSF18CHD','Non-Inverter','1.5',1.42,17100,1390,12.302158273381295,14500,1665,8.7087087087087092,10.41,'Split_Wall_Mounted BeSat 1.42TR SEER 10.41','Split_Wall_Mounted Mando 1.53TR SEER 10.38'),
('Split_Wall_Mounted','TACHIAIR','TC18C/7316','Non-Inverter','1.5',1.45,17400,1510,11.523178807947019,14900,1730,8.6127167630057802,9.9,'Split_Wall_Mounted TACHIAIR 1.45TR SEER 9.9','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','Mando','KT3F-51W/S','Non-Inverter','1.5',1.45,17400,1510,11.523178807947019,14900,1730,8.6127167630057802,9.9,'Split_Wall_Mounted Mando 1.45TR SEER 9.9','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','Craft','DSN24FE7YTAI','Non-Inverter','2',2,24000,1832,13.100436681222707,23000,2754,8.3514887436456071,10.85,'Split_Wall_Mounted Craft 2TR SEER 10.85','Split_Wall_Mounted Zamil 2TR SEER 10.39'),
('Split_Wall_Mounted','Haas','HSA25FE7HH7','Non-Inverter','2',1.91,23000,1925,11.948051948051948,19800,2290,8.6462882096069862,10.18,'Split_Wall_Mounted Haas 1.91TR SEER 10.18','Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','LG','S242LH','Non-Inverter','2',2,24000,2450,9.795918367346939,19278,2850,6.7642105263157895,8.1999999999999993,'Split_Wall_Mounted LG 2TR SEER 8.2','Split_Wall_Mounted Zamil 1.95TR SEER 8.11'),
('Split_Wall_Mounted','Falcon','FQS36C8','Non-Inverter','2.5',2.5,30000,2440,12.295081967213115,25600,2940,8.7074829931972797,10.41,'Split_Wall_Mounted Falcon 2.5TR SEER 10.41','Split_Wall_Mounted Carrier 2.58TR SEER 10.41'),
('Split_Wall_Mounted','Lakes','LSAC-12H/A','Non-Inverter','1',0.9,10918,1200,9.0983333333333327,9553,1400,6.8235714285714284,7.84,'Split_Wall_Mounted Lakes 0.9TR SEER 7.84','Split_Wall_Mounted LG 0.95TR SEER 7.9'),
('Split_Wall_Mounted','LG','LS-C242TLB2','Non-Inverter','2',2,24000,2350,10.212765957446809,19722.180759999999,2700,7.304511392592592,8.65,'Split_Wall_Mounted LG 2TR SEER 8.65','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','LG','S182KC ST2','Non-Inverter','1.5',1.5,18000,1900,9.473684210526315,16002.94598,2080,7.6937240288461544,8.34,'Split_Wall_Mounted LG 1.5TR SEER 8.34','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','Haas','HSA20FE6HH7N','Non-Inverter','1.5',1.5,18000,1485,12.121212121212121,15600,1785,8.7394957983193269,10.33,'Split_Wall_Mounted Haas 1.5TR SEER 10.33','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Falcon','FQS12C8','Non-Inverter','1',0.99,11900,975,12.205128205128204,10000,1150,8.695652173913043,10.34,'Split_Wall_Mounted Falcon 0.99TR SEER 10.34','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','LG','Y182SC / X182EC','Non-Inverter','1.5',1.54,18562,1950,9.5189743589743596,16037,2300,6.9726086956521742,8.14,'Split_Wall_Mounted LG 1.54TR SEER 8.14','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','Bancool','BC18CHL','Non-Inverter','1.5',1.49,17913,1480,12.103378378378379,15354,1760,8.723863636363637,10.299999999999999,'Split_Wall_Mounted Bancool 1.49TR SEER 10.3','Split_Wall_Mounted Mando 1.5TR SEER 10.35'),
('Split_Wall_Mounted','Ugine','UTS24LSRN-7','Non-Inverter','2',1.83,22000,1880,11.702127659574469,18700,2255,8.2926829268292686,9.91,'Split_Wall_Mounted Ugine 1.83TR SEER 9.91','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Craft','DSA20FE7GR7','Non-Inverter','1.5',1.5,18000,1525,11.803278688524591,14900,1773,8.4038353073886061,9.99,'Split_Wall_Mounted Craft 1.5TR SEER 9.99','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','LG','T242SH','Non-Inverter','2',1.91,22929,2690,8.5237918215613391,20302,3010,6.7448504983388702,7.46,'Split_Wall_Mounted LG 1.91TR SEER 7.46','Split_Wall_Mounted Daikin 1.78TR SEER 7.47'),
('Split_Wall_Mounted','LG','S3224H','Non-Inverter','2',2.21,26614,2700,9.8570370370370366,23714,3450,6.873623188405797,8.34,'Split_Wall_Mounted LG 2.21TR SEER 8.34','Split_Wall_Mounted Zamil 2.35TR SEER 9.85'),
('Split_Wall_Mounted','LG','S182 MH','Non-Inverter','1.5',1.49,17981.98834,2060,8.729120553398058,15491.124680000001,2870,5.3976044181184673,7.12,'Split_Wall_Mounted LG 1.49TR SEER 7.12','Split_Wall_Mounted Daikin 1.55TR SEER 7.08'),
('Split_Wall_Mounted','Panasonic','CU-YW24WKS','Non-Inverter','2',1.75,21000,1721,12.20220801859384,19200,2207,8.6995922066153142,10.41,'Split_Wall_Mounted Panasonic 1.75TR SEER 10.41','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Gree','GWH24ACE-D3NTA1G/O','Non-Inverter','2',1.83,22500,1838,12.241566920565832,18900,2228,8.4829443447037693,10.29,'Split_Wall_Mounted Gree 1.83TR SEER 10.29','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','X242EH','Non-Inverter','2',1.71,20539,2160,9.5087962962962962,17743,2530,7.0130434782608697,8.15,'Split_Wall_Mounted LG 1.71TR SEER 8.15','Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','Gree','GWC24QE-D3NTB4F/O','Non-Inverter','2',1.85,22250,1838,12.105549510337323,18900,2228,8.4829443447037693,10.220000000000001,'Split_Wall_Mounted Gree 1.85TR SEER 10.22','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','S242SCN52','Non-Inverter','2',1.83,22015.32,2500,8.8061279999999993,17060.71,3000,5.6869033333333334,7.22,'Split_Wall_Mounted LG 1.83TR SEER 7.22','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','York','YHFE24XT3CFE-R3','Non-Inverter','2',1.91,23000,1870,12.299465240641711,19800,2275,8.7032967032967026,10.42,'Split_Wall_Mounted York 1.91TR SEER 10.42','Split_Wall_Mounted Zamil 1.83TR SEER 10.42'),
('Split_Wall_Mounted','Mando','KT3FR-81GW/S','Non-Inverter','2',1.68,20200,1750,11.542857142857143,17700,2130,8.3098591549295779,9.84,'Split_Wall_Mounted Mando 1.68TR SEER 9.84','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','MTC','MTC18C/7S-C17','Non-Inverter','1.5',1.45,17400,1510,11.523178807947019,14900,1730,8.6127167630057802,9.9,'Split_Wall_Mounted MTC 1.45TR SEER 9.9','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','Comfort','MSAC-18CS/GT7','Non-Inverter','1.5',1.46,17530,1510,11.609271523178808,15695,1950,8.0487179487179485,9.81,'Split_Wall_Mounted Comfort 1.46TR SEER 9.81','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','New_house','YST3-30CR-D2','Non-Inverter','2',2.2599999999999998,27200,2230,12.197309417040358,22600,2613,8.6490623804056632,10.31,'Split_Wall_Mounted New_house 2.26TR SEER 10.31','Split_Wall_Mounted Zamil 2.24TR SEER 10.35'),
('Split_Wall_Mounted','Haam','HN24H1ST16','Non-Inverter','2',1.68,20200,1750,11.542857142857143,17700,2130,8.3098591549295779,9.84,'Split_Wall_Mounted Haam 1.68TR SEER 9.84','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Haam','HM24CSM19N','Non-Inverter','2',1.84,22100,1811,12.203202650469354,18400,2152,8.5501858736059475,10.28,'Split_Wall_Mounted Haam 1.84TR SEER 10.28','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','Mando','S-093H/S','Non-Inverter','1.5',1.53,18400,1484,12.398921832884097,16200,1800,9,10.6,'Split_Wall_Mounted Mando 1.53TR SEER 10.6','Split_Wall_Mounted Zamil 1.49TR SEER 10.52'),
('Split_Wall_Mounted','Haam','HM24C/7S16','Non-Inverter','2',1.73,20800,1800,11.555555555555555,16700,2000,8.35,9.7899999999999991,'Split_Wall_Mounted Haam 1.73TR SEER 9.79','Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','LG','S242LH ST2','Non-Inverter','2',2,24000,2450,9.795918367346939,19278.602299999999,2850,6.7644218596491221,8.1999999999999993,'Split_Wall_Mounted LG 2TR SEER 8.2','Split_Wall_Mounted Zamil 1.95TR SEER 8.11'),
('Split_Wall_Mounted','LG','FEZ24C','Non-Inverter','2',1.91,22999,1991,11.551481667503767,20010,2410,8.3029045643153534,9.84,'Split_Wall_Mounted LG 1.91TR SEER 9.84','Split_Wall_Mounted Carrier 1.92TR SEER 9.83'),
('Split_Wall_Mounted','Champion','CHSSI-24H','Non-Inverter','2',1.86,22349.5301,2560,8.7302851953125007,19610,3055,6.4189852700490997,7.49,'Split_Wall_Mounted Champion 1.86TR SEER 7.49','Split_Wall_Mounted Daikin 1.78TR SEER 7.47'),
('Split_Wall_Mounted','LG','LS-H182TKA2','Non-Inverter','1.5',1.5,18000,1900,9.473684210526315,15609,2040,7.651470588235294,8.31,'Split_Wall_Mounted LG 1.5TR SEER 8.31','Split_Wall_Mounted LG 1.53TR SEER 8.30'),
('Split_Wall_Mounted','LG','B2424C ','Non-Inverter','2',1.82,21871.83022,1900,11.511489589473683,18971.50952,2290,8.2845019737991272,9.7999999999999989,'Split_Wall_Mounted LG 1.82TR SEER 9.8','Split_Wall_Mounted LG 1.99TR SEER 9.80'),
('Split_Wall_Mounted','LG','X2A2EH','Non-Inverter','2',1.88,22588.38004,2160,10.457583351851852,17743.1384,2530,7.0130981818181821,8.67,'Split_Wall_Mounted LG 1.88TR SEER 8.67','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','Mando','AC-24H-MPZ','Non-Inverter','2',2,24000,2000,12,20230.660100000001,2330,8.6826867381974253,10.209999999999999,'Split_Wall_Mounted Mando 2TR SEER 10.21','Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','LG','S122SC','Non-Inverter','1',0.91,10983,1290,8.5139534883720938,9383.3904999999995,1490,6.2975775167785235,7.3,'Split_Wall_Mounted LG 0.91TR SEER 7.3','Split_Wall_Mounted LG 0.95TR SEER 7.9'),
('Split_Wall_Mounted','LG','S242NC','Non-Inverter','2',1.95,23492,2750,8.5425454545454542,21496.494600000002,3270,6.5738515596330283,7.4399999999999995,'Split_Wall_Mounted LG 1.95TR SEER 7.44','Split_Wall_Mounted Daikin 1.78TR SEER 7.47'),
('Split_Wall_Mounted','LG','S242KC','Non-Inverter','2',2,24000,2350,10.212765957446809,19722.180759999999,2700,7.304511392592592,8.65,'Split_Wall_Mounted LG 2TR SEER 8.65','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','Midea','M3TEP18CRNMB2','Non-Inverter','1.5',1.54,18500,1590,11.635220125786164,16500,1850,8.9189189189189193,10.1,'Split_Wall_Mounted Midea 1.54TR SEER 10.1','Split_Wall_Mounted LG 1.47TR SEER 10.15'),
('Split_Wall_Mounted','LG','Y182NH','Non-Inverter','1.5',1.52,18251,1900,9.6057894736842098,15187,2200,6.9031818181818183,8.15,'Split_Wall_Mounted LG 1.52TR SEER 8.15','Split_Wall_Mounted LG 1.52TR SEER 8.15'),
('Split_Wall_Mounted','LG','B2424C','Non-Inverter','2',1.82,21871.83022,1900,11.511489589473683,18971.50952,2290,8.2845019737991272,9.7999999999999989,'Split_Wall_Mounted LG 1.82TR SEER 9.8','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','T242SC','Non-Inverter','2',1.91,22999,2550,9.0192156862745101,20641,3000,6.8803333333333336,7.8199999999999994,'Split_Wall_Mounted LG 1.91TR SEER 7.82','Split_Wall_Mounted DAEWOO 2TR SEER 7.86'),
('Split_Wall_Mounted','LG','Y242NC N54','Non-Inverter','2',1.74,20984.673299999999,2200,9.5384878636363624,18254.959699999999,2800,6.5196284642857139,8.01,'Split_Wall_Mounted LG 1.74TR SEER 8.01','Split_Wall_Mounted Carrier 1.81TR SEER 7.91'),
('Split_Wall_Mounted','LG','S242SH N51','Non-Inverter','2',1.87,22520.137200000001,2640,8.5303550000000001,18947.5,3250,5.83,7.1499999999999995,'Split_Wall_Mounted LG 1.87TR SEER 7.15','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','LG','X242EC NC4','Non-Inverter','2',1.74,20984.673299999999,2200,9.5384878636363624,18254.959699999999,2600,7.0211383461538457,8.18,'Split_Wall_Mounted LG 1.74TR SEER 8.18','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','B2424C N51','Non-Inverter','2',1.82,21865,1900,11.507894736842106,18965,2290,8.2816593886462879,9.7999999999999989,'Split_Wall_Mounted LG 1.82TR SEER 9.8','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','X242SH NC3','Non-Inverter','2',1.71,20541.094840000002,2160,9.5097661296296305,17743.1384,2530,7.0130981818181821,8.15,'Split_Wall_Mounted LG 1.71TR SEER 8.15','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','Carrier','38QKB0303','Non-Inverter','2',2.25,27000,2213,12.200632625395391,23000,2614,8.798775822494262,10.379999999999999,'Split_Wall_Mounted Carrier 2.25TR SEER 10.38','Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','LG','S242NH ','Non-Inverter','2',1.91,22997.837080000001,2630,8.744424745247148,20063.394960000001,3035,6.6106737924217471,7.55,'Split_Wall_Mounted LG 1.91TR SEER 7.55','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','LG','S242DH','Non-Inverter','2',1.79,21496.494600000002,2700,7.9616646666666675,18425.566800000001,3250,5.6694051692307692,6.76,'Split_Wall_Mounted LG 1.79TR SEER 6.76','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','YONAN','KTF9R-24GWIi','Non-Inverter','2',2,24000,2450,9.795918367346939,22000,2900,7.5862068965517242,8.5499999999999989,'Split_Wall_Mounted YONAN 2TR SEER 8.55','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','LG','S242SC N51','Non-Inverter','2',1.87,22520.137200000001,2640,8.5303550000000001,18835.023840000002,3000,6.2783412800000002,7.29,'Split_Wall_Mounted LG 1.87TR SEER 7.29','Split_Wall_Mounted LG 1.79TR SEER 7.34'),
('Split_Wall_Mounted','O2','OSA-18KC7','Non-Inverter','1.5',1.53,18400,1510,12.185430463576159,15800,1800,8.7777777777777786,10.37,'Split_Wall_Mounted O2 1.53TR SEER 10.37','Split_Wall_Mounted Okia 1.53TR SEER 10.37'),
('Split_Wall_Mounted','Frego','FW12X2H9','Non-Inverter','1',1.02,12300,1010,12.178217821782178,10600,1260,8.412698412698413,10.25,'Split_Wall_Mounted Frego 1.02TR SEER 10.25','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','General','GC-18K/LK','Non-Inverter','1.5',1.53,18400,1510,12.185430463576159,15800,1800,8.7777777777777786,10.37,'Split_Wall_Mounted General 1.53TR SEER 10.37','Split_Wall_Mounted Okia 1.53TR SEER 10.37'),
('Split_Wall_Mounted','Lakes','LSAC-12C/6S','Non-Inverter','1',1.01,12225,1060,11.533018867924529,10416,1240,8.4,9.84,'Split_Wall_Mounted Lakes 1.01TR SEER 9.84','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Midea','MSTO26HRNM10','Non-Inverter','2',2.04,24563,2092,11.741395793499043,21396,2496,8.572115384615385,10.039999999999999,'Split_Wall_Mounted Midea 2.04TR SEER 10.04','Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','LG','A182SH NC0','Non-Inverter','1.5',1.42,17060.71,1480,11.527506756756756,14740.453439999999,1780,8.2811536179775285,9.81,'Split_Wall_Mounted LG 1.42TR SEER 9.81','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','Samsung','AQ24TULN','Non-Inverter','2',2,24000,2600,9.2307692307692299,19841.603608298999,2900,6.8419322787237933,7.89,'Split_Wall_Mounted Samsung 2TR SEER 7.89','Split_Wall_Mounted Carrier 1.81TR SEER 7.91'),
('Split_Wall_Mounted','Samsung','AQ18UUPN','Non-Inverter','1.5',1.5,18000,1900,9.473684210526315,15278.0347783902,2250,6.7902376792845329,8.0499999999999989,'Split_Wall_Mounted Samsung 1.5TR SEER 8.05','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','KELON','KHS24H','Non-Inverter','2',1.91,23000,1925,11.948051948051948,19800,2290,8.6462882096069862,10.18,'Split_Wall_Mounted KELON 1.91TR SEER 10.18','Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','LG','Y24SH','Non-Inverter','2',1.74,20950.551879999999,2200,9.5229781272727276,18254.959699999999,2550,7.1588077254901963,8.2099999999999991,'Split_Wall_Mounted LG 1.74TR SEER 8.21','Split_Wall_Mounted LG 1.74TR SEER 8.20'),
('Split_Wall_Mounted','AUX','AUX24HOC','Non-Inverter','2',1.83,22000,1800,12.222222222222221,16800,2200,7.6363636363636367,9.92,'Split_Wall_Mounted AUX 1.83TR SEER 9.92','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','LG','S182DP','Non-Inverter','1.5',1.5,18000,1950,9.2307692307692299,16787.73864,2080,8.0710281923076916,8.32,'Split_Wall_Mounted LG 1.5TR SEER 8.32','Split_Wall_Mounted LG 1.53TR SEER 8.30'),
('Split_Wall_Mounted','Daikin','RY24HEVLK','Non-Inverter','2',1.77,21350,2470,8.6437246963562746,18330,2770,6.6173285198555956,7.4799999999999995,'Split_Wall_Mounted Daikin 1.77TR SEER 7.48','Split_Wall_Mounted Daikin 1.78TR SEER 7.47'),
('Split_Wall_Mounted','LG','S242DP','Non-Inverter','2',2,24000,2350,10.212765957446809,18664,2840,6.5718309859154926,8.3699999999999992,'Split_Wall_Mounted LG 2TR SEER 8.37','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','LG','S242KO','Non-Inverter','2',2,24000,2890,8.3044982698961931,19722,3200,6.163125,7.1,'Split_Wall_Mounted LG 2TR SEER 7.1','Split_Wall_Mounted MITSUBISHI 2.03TR SEER 7.10'),
('Split_Wall_Mounted','LG','S182HN52','Non-Inverter','1.5',1.41,17026,2100,8.1076190476190479,14672,2450,5.9885714285714284,6.95,'Split_Wall_Mounted LG 1.41TR SEER 6.95','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','Fuji','FOJ24SCH','Non-Inverter','2',1.68,20200,1750,11.542857142857143,17700,2130,8.3098591549295779,9.84,'Split_Wall_Mounted Fuji 1.68TR SEER 9.84','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Classic','AD030CHXCW2','Non-Inverter','2',2.29,27552.136752136754,2320,11.875921013852048,24198,2847,8.4994731296101165,10.11,'Split_Wall_Mounted Classic 2.29TR SEER 10.11','Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','Classic','KRC18CDMHJOW1','Non-Inverter','1.5',1.48,17777.777777777781,1532,11.604293588627794,14781,1782,8.2946127946127941,9.83,'Split_Wall_Mounted Classic 1.48TR SEER 9.83','Split_Wall_Mounted York 1.42TR SEER 9.83'),
('Split_Wall_Mounted','Classic','AD024CCXOW2','Non-Inverter','2',2.29,27500,2320,11.853448275862069,24200,2847,8.5001756234632939,10.1,'Split_Wall_Mounted Classic 2.29TR SEER 10.1','Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','Classic','AD018CCXOW','Non-Inverter','1.5',1.5,18000,1558,11.553273427471117,15000,1807,8.3010514665190929,9.7999999999999989,'Split_Wall_Mounted Classic 1.5TR SEER 9.8','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','Classic','AD024CHXOW2','Non-Inverter','2',1.91,23000,1965,11.704834605597965,18300,2179,8.3983478659935749,9.89,'Split_Wall_Mounted Classic 1.91TR SEER 9.89','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Mando','KT3FR-61GWS','Non-Inverter','1.5',1.47,17700,1740,10.172413793103448,17700,2130,8.3098591549295779,9.08,'Split_Wall_Mounted Mando 1.47TR SEER 9.08','Split_Wall_Mounted General 1.5TR SEER 10.16'),
('Split_Wall_Mounted','Mando','S-030-H/S','Non-Inverter','2',2,24000,2080,11.538461538461538,20500,2380,8.6134453781512601,9.91,'Split_Wall_Mounted Mando 2TR SEER 9.91','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','S12DDC','Non-Inverter','1',1,12010,1200,10.008333333333333,10577,1400,7.5549999999999997,8.64,'Split_Wall_Mounted LG 1TR SEER 8.64','Split_Wall_Mounted LG 0.95TR SEER 8.3'),
('Split_Wall_Mounted','LG','T3224HNV0','Non-Inverter','2.5',2.33,27979,2320,12.059913793103448,24601,2650,9.2833962264150944,10.47,'Split_Wall_Mounted LG 2.33TR SEER 10.47','Split_Wall_Mounted LG 2.33TR SEER 10.46'),
('Split_Wall_Mounted','Carrier','42XPL030H3P','Non-Inverter','2',2.25,27000,2260,11.946902654867257,24000,2700,8.8888888888888893,10.29,'Split_Wall_Mounted Carrier 2.25TR SEER 10.29','Split_Wall_Mounted Zamil 2.24TR SEER 10.35'),
('Split_Wall_Mounted','York','YJGE24XH3CHL-R5','Non-Inverter','2',1.83,22000,1810,12.154696132596685,19000,2222,8.5508550855085517,10.28,'Split_Wall_Mounted York 1.83TR SEER 10.28','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','York','YJGE18XH3CHL','Non-Inverter','1.5',1.5,18000,1481,12.153950033760973,15400,1800,8.5555555555555554,10.28,'Split_Wall_Mounted York 1.5TR SEER 10.28','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','LG','LS-H242TG','Non-Inverter','2',2,24000,2525,9.5049504950495045,19142,2730,7.0117216117216117,8.1,'Split_Wall_Mounted LG 2TR SEER 8.1','Split_Wall_Mounted Zamil 2.12TR SEER 8.09'),
('Split_Wall_Mounted','Samsung','AR24KRFHRWKN','Non-Inverter','1.5',1.66,20000,1690,11.834319526627219,16500,1950,8.4615384615384617,10.02,'Split_Wall_Mounted Samsung 1.66TR SEER 10.02','Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','Midea','MSTE18CRNAB4','Non-Inverter','1.5',1.5,18000,1488,12.096774193548388,15900,1849,8.5992428339643059,10.28,'Split_Wall_Mounted Midea 1.5TR SEER 10.28','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','Fuji','FOJ24CO','Non-Inverter','2',1.73,20704,2160,9.5851851851851855,17683,2390,7.3987447698744768,8.31,'Split_Wall_Mounted Fuji 1.73TR SEER 8.31','Split_Wall_Mounted Carrier 1.79TR SEER 8.31'),
('Split_Wall_Mounted','Haier','HSU-18LZ413','Non-Inverter','1.5',1.43,17200,1450,11.862068965517242,15000,1720,8.720930232558139,10.16,'Split_Wall_Mounted Haier 1.43TR SEER 10.16','Split_Wall_Mounted General 1.5TR SEER 10.16'),
('Split_Wall_Mounted','Carrier','42HL0183P','Non-Inverter','1.5',1.45,17500,1500,11.666666666666666,15000,1780,8.4269662921348321,9.94,'Split_Wall_Mounted Carrier 1.45TR SEER 9.94','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','Matco','MATSF18H','Non-Inverter','1.5',1.43,17197,1431,12.017470300489169,14899,1703,8.7486788021139166,10.27,'Split_Wall_Mounted Matco 1.43TR SEER 10.27','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','LG','B1824H','Non-Inverter','1.5',1.45,17403,1510,11.525165562913907,14978,1800,8.3211111111111116,9.82,'Split_Wall_Mounted LG 1.45TR SEER 9.82','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','TACHIAIR','TC24H/6S15','Non-Inverter','2',1.68,20200,1750,11.542857142857143,17700,2130,8.3098591549295779,9.84,'Split_Wall_Mounted TACHIAIR 1.68TR SEER 9.84','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Ugine','UGN- P24H-R','Non-Inverter','2',1.93,23202,2000,11.601000000000001,19899,2390,8.325941422594143,9.86,'Split_Wall_Mounted Ugine 1.93TR SEER 9.86','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','LG','S182KC','Non-Inverter','1.5',1.5,18000,1900,9.473684210526315,13074,1940,6.7391752577319588,7.9399999999999995,'Split_Wall_Mounted LG 1.5TR SEER 7.94','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','LG','S122SH','Non-Inverter','1',0.96,11480,1200,9.5666666666666664,10236,1400,7.3114285714285714,8.2999999999999989,'Split_Wall_Mounted LG 0.96TR SEER 8.3','Split_Wall_Mounted LG 0.95TR SEER 8.3'),
('Split_Wall_Mounted','LG','LS-H242TM','Non-Inverter','2',2,24000,2525,9.5049504950495045,19143,2730,7.012087912087912,8.1,'Split_Wall_Mounted LG 2TR SEER 8.1','Split_Wall_Mounted Zamil 2.12TR SEER 8.09'),
('Split_Wall_Mounted','LG','B182PH','Non-Inverter','1.5',1.45,17469,1510,11.568874172185431,14979,1800,8.3216666666666672,9.84,'Split_Wall_Mounted LG 1.45TR SEER 9.84','Split_Wall_Mounted LG 1.45TR SEER 9.84'),
('Split_Wall_Mounted','LG','B242PH','Non-Inverter','2',1.74,20886,1820,11.475824175824176,19941,2280,8.746052631578948,10.01,'Split_Wall_Mounted LG 1.74TR SEER 10.01','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','Haam','HM36C','Non-Inverter','2',2.2999999999999998,27600,2400,11.5,23500,2880,8.1597222222222214,9.74,'Split_Wall_Mounted Haam 2.3TR SEER 9.74','Split_Wall_Mounted Samsung 2.33TR SEER 9.83'),
('Split_Wall_Mounted','Dansat','DSA18C','Non-Inverter','1.5',1.44,17300,1430,12.097902097902098,14900,1710,8.7134502923976616,10.299999999999999,'Split_Wall_Mounted Dansat 1.44TR SEER 10.3','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','York','YHQE24XT2CHS','Non-Inverter','2',1.83,22000,1774,12.401352874859075,19000,2183,8.7036188731103987,10.49,'Split_Wall_Mounted York 1.83TR SEER 10.49','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Classic','AD018CCXOD','Non-Inverter','1.5',1.51,18196,1389,13.10007199424046,15502,1722,9.0023228803716613,11,'Split_Wall_Mounted Classic 1.51TR SEER 11','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Aukia','AUK24CH','Non-Inverter','2',1.8,21666,1830,11.839344262295082,18766,2200,8.5299999999999994,10.08,'Split_Wall_Mounted Aukia 1.8TR SEER 10.08','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','LG','LS-H242TLB1','Non-Inverter','2',1.79,21496,2700,7.9614814814814814,18425,3250,5.6692307692307695,6.76,'Split_Wall_Mounted LG 1.79TR SEER 6.76','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Carrier','42QKB0363P','Non-Inverter','2.5',2.61,31400,2595,12.10019267822736,26600,3093,8.6000646621403174,10.25,'Split_Wall_Mounted Carrier 2.61TR SEER 10.25','Split_Wall_Mounted Carrier 2.58TR SEER 10.41'),
('Split_Wall_Mounted','Carrier','42QKA0183P','Non-Inverter','1.5',1.45,17500,1434,12.203626220362622,15500,1761,8.8018171493469612,10.42,'Split_Wall_Mounted Carrier 1.45TR SEER 10.42','Split_Wall_Mounted Mando 1.53TR SEER 10.38')
on conflict (equipment_type, model_no) do update set
  make = excluded.make,
  compressor_type = excluded.compressor_type,
  size_category = excluded.size_category,
  tr = excluded.tr,
  t1_btu = excluded.t1_btu,
  t1_w = excluded.t1_w,
  t1_eer = excluded.t1_eer,
  t3_btu = excluded.t3_btu,
  t3_w = excluded.t3_w,
  t3_eer = excluded.t3_eer,
  equivalent_seer = excluded.equivalent_seer,
  surveyed_unit_description = excluded.surveyed_unit_description,
  equivalent_ac_model_description = excluded.equivalent_ac_model_description
where (t.make, t.compressor_type, t.size_category, t.tr, t.t1_btu, t.t1_w, t.t1_eer, t.t3_btu, t.t3_w, t.t3_eer, t.equivalent_seer, t.surveyed_unit_description, t.equivalent_ac_model_description)
   is distinct from (excluded.make, excluded.compressor_type, excluded.size_category, excluded.tr, excluded.t1_btu, excluded.t1_w, excluded.t1_eer, excluded.t3_btu, excluded.t3_w, excluded.t3_eer, excluded.equivalent_seer, excluded.surveyed_unit_description, excluded.equivalent_ac_model_description);

-- >>> CHUNK 3/11 — old_model_registry rows 401-600 of 1516
insert into public.old_model_registry as t (equipment_type, make, model_no, compressor_type, size_category, tr, t1_btu, t1_w, t1_eer, t3_btu, t3_w, t3_eer, equivalent_seer, surveyed_unit_description, equivalent_ac_model_description) values
('Split_Wall_Mounted','Carrier','42QHL0243P','Non-Inverter','2',1.79,21500,1800,11.944444444444445,18500,2130,8.6854460093896719,10.19,'Split_Wall_Mounted Carrier 1.79TR SEER 10.19','Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','Carrier','38QHL0183','Non-Inverter','1.5',1.45,17500,1500,11.666666666666666,15000,1780,8.4269662921348321,9.94,'Split_Wall_Mounted Carrier 1.45TR SEER 9.94','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','Hitachi','RMB018ABDA4EZ1','Non-Inverter','1.5',1.48,17800,1460,12.191780821917808,14900,1760,8.4659090909090917,10.25,'Split_Wall_Mounted Hitachi 1.48TR SEER 10.25','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','Beko','BTYSH240','Non-Inverter','2',1.7,20500,2503,8.1901717938473837,19107,3000,6.3689999999999998,7.17,'Split_Wall_Mounted Beko 1.7TR SEER 7.17','Split_Wall_Mounted LG 1.87TR SEER 7.14'),
('Split_Wall_Mounted','Gree','GWC24ACE','Non-Inverter','2',1.83,22000,1880,11.702127659574469,18700,2255,8.2926829268292686,9.91,'Split_Wall_Mounted Gree 1.83TR SEER 9.91','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Gree','GAN24C','Non-Inverter','2',1.76,21200,1730,12.254335260115607,18500,2050,9.0243902439024382,10.51,'Split_Wall_Mounted Gree 1.76TR SEER 10.51','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','S182MH','Non-Inverter','1.5',1.5,18017.094017094016,2060,8.7461621442203956,15491,2370,6.5362869198312232,7.52,'Split_Wall_Mounted LG 1.5TR SEER 7.52','Split_Wall_Mounted LG 1.46TR SEER 7.56'),
('Split_Wall_Mounted','Kelvinator','KMS18H8','Non-Inverter','1.5',1.5,18100,1484,12.196765498652292,15900,1797,8.8480801335559267,10.42,'Split_Wall_Mounted Kelvinator 1.5TR SEER 10.42','Split_Wall_Mounted Mando 1.53TR SEER 10.38'),
('Split_Wall_Mounted','LG','S-242SH','Non-Inverter','2',1.88,22598.290598290601,2640,8.5599585599585613,18937,3250,5.8267692307692309,7.16,'Split_Wall_Mounted LG 1.88TR SEER 7.16','Split_Wall_Mounted LG 1.87TR SEER 7.14'),
('Split_Wall_Mounted','Midea','MSTM18CRN','Non-Inverter','1.5',1.55,18660,1545,12.077669902912621,16282,1850,8.8010810810810813,10.33,'Split_Wall_Mounted Midea 1.55TR SEER 10.33','Split_Wall_Mounted Mando 1.5TR SEER 10.35'),
('Split_Wall_Mounted','Gree','GWH30ACE-D3NTA1D-/O','Non-Inverter','2',2.27,27300,2310,11.818181818181818,23000,2705,8.502772643253234,10.039999999999999,'Split_Wall_Mounted Gree 2.27TR SEER 10.04','Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','Gree','GWH18ACD-D3NTA1F/O','Non-Inverter','1.5',1.5,18000,1525,11.803278688524591,14900,1773,8.4038353073886061,9.99,'Split_Wall_Mounted Gree 1.5TR SEER 9.99','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','KAYAN','KAYANN-ENERGY-1975-18K-H','Non-Inverter','1.5',1.45,17400,1510,11.523178807947019,14900,1730,8.6127167630057802,9.9,'Split_Wall_Mounted KAYAN 1.45TR SEER 9.9','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','Gree','GWC24QE-D3NTBF/O','Non-Inverter','2',1.83,22000,1880,11.702127659574469,18700,2255,8.2926829268292686,9.91,'Split_Wall_Mounted Gree 1.83TR SEER 9.91','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Gree','GWC18ACD-D3NTA1H/O','Non-Inverter','1.5',1.5,18000,1525,11.803278688524591,14900,1773,8.4038353073886061,9.99,'Split_Wall_Mounted Gree 1.5TR SEER 9.99','Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','Gree','GWH36LB-D3NTB2A/O','Non-Inverter','2.5',2.5,30000,2540,11.811023622047244,25200,2960,8.513513513513514,10.039999999999999,'Split_Wall_Mounted Gree 2.5TR SEER 10.04','Split_Wall_Mounted LG 2.5TR SEER 10.43'),
('Split_Wall_Mounted','Haam','HM12CWM7S17','Non-Inverter','1',0.99,11900,1000,11.9,10300,1190,8.655462184873949,10.16,'Split_Wall_Mounted Haam 0.99TR SEER 10.16','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Gree','GWH18ACD-D3NTA1F/I','Non-Inverter','1.5',1.5,18000,1525,11.803278688524591,14900,1773,8.4038353073886061,9.99,'Split_Wall_Mounted Gree 1.5TR SEER 9.99','Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','Falcon','FMS18H9','Non-Inverter','1.5',1.5,18000,1452,12.396694214876034,15900,1797,8.8480801335559267,10.549999999999999,'Split_Wall_Mounted Falcon 1.5TR SEER 10.55','Split_Wall_Mounted Zamil 1.49TR SEER 10.52'),
('Split_Wall_Mounted','Gree','GWH24ACE-D3NTA1B/O','Non-Inverter','2',1.84,22100,1840,12.010869565217391,19100,2213,8.6308178942611846,10.220000000000001,'Split_Wall_Mounted Gree 1.84TR SEER 10.22','Split_Wall_Mounted LG 1.83TR SEER 10.27'),
('Split_Wall_Mounted','Haam','HM36C/8816','Non-Inverter','2',2.2999999999999998,27600,2400,11.5,23500,2880,8.1597222222222214,9.74,'Split_Wall_Mounted Haam 2.3TR SEER 9.74','Split_Wall_Mounted Samsung 2.33TR SEER 9.83'),
('Split_Wall_Mounted','Gree','GWH30ACE-D3NTA1D/O','Non-Inverter','2',2.27,27300,2310,11.818181818181818,23000,2705,8.502772643253234,10.039999999999999,'Split_Wall_Mounted Gree 2.27TR SEER 10.04','Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','Gree','GWH18QD-D3NTA1E/O','Non-Inverter','1.5',1.5,18000,1525,11.803278688524591,14900,1773,8.4038353073886061,9.99,'Split_Wall_Mounted Gree 1.5TR SEER 9.99','Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','YOKO','YOKO-30CH','Non-Inverter','2',2.1800000000000002,26170,2200,11.895454545454545,22174,2671,8.3017596405840504,10.029999999999999,'Split_Wall_Mounted YOKO 2.18TR SEER 10.03','Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','Falcon','FMS30H9','Non-Inverter','2',2.25,27000,2180,12.385321100917432,23800,2645,8.9981096408317587,10.59,'Split_Wall_Mounted Falcon 2.25TR SEER 10.59','Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','Haam','KFR-61GW/a','Non-Inverter','2',1.73,20814.063961299998,2320,8.9715792936637921,17743,2650,6.6954716981132076,7.71,'Split_Wall_Mounted Haam 1.73TR SEER 7.71','Split_Wall_Mounted Carrier 1.75TR SEER 7.63'),
('Split_Wall_Mounted','General','GNPL24HHL','Non-Inverter','2',1.75,21000,1700,12.352941176470589,18100,2070,8.7439613526570046,10.47,'Split_Wall_Mounted General 1.75TR SEER 10.47','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','B2427H','Non-Inverter','2',1.74,20950,1820,11.510989010989011,18937,2280,8.3057017543859644,9.84,'Split_Wall_Mounted LG 1.74TR SEER 9.84','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Daewoo','DS4-24W','Non-Inverter','2',2,24000,2320,10.344827586206897,20000,2750,7.2727272727272725,8.73,'Split_Wall_Mounted Daewoo 2TR SEER 8.73','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','Falcon','FTS36C','Non-Inverter','2.5',2.4,28860,2306,12.515177797051171,23600,2713,8.6988573534832287,10.51,'Split_Wall_Mounted Falcon 2.4TR SEER 10.51','Split_Wall_Mounted Carrier 2.58TR SEER 10.41'),
('Split_Wall_Mounted','York','YHGE24YT2BFEO-3','Non-Inverter','2',1.91,23000,1870,12.299465240641711,19800,2275,8.7032967032967026,10.42,'Split_Wall_Mounted York 1.91TR SEER 10.42','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Mando','S-D30H/HR','Non-Inverter','2',1.99,23884.99,2000,11.942495000000001,21496,3200,6.7175000000000002,9.4700000000000006,'Split_Wall_Mounted Mando 1.99TR SEER 9.47','Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','Craft','DS24CE7SCWT','Non-Inverter','2',2,24000,1846,13.001083423618635,20400,2400,8.5,10.76,'Split_Wall_Mounted Craft 2TR SEER 10.76','Split_Wall_Mounted Zamil 2TR SEER 10.39'),
('Split_Wall_Mounted','Gree','GWH18ACD-D3NTA1H/I','Non-Inverter','1.5',1.5,18000,1525,11.803278688524591,14900,1773,8.4038353073886061,9.99,'Split_Wall_Mounted Gree 1.5TR SEER 9.99','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Gree','GWH18QD-D3NTB4D/I','Non-Inverter','1.5',1.5,18000,1525,11.803278688524591,14900,1773,8.4038353073886061,9.99,'Split_Wall_Mounted Gree 1.5TR SEER 9.99','Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','LG','T242EH','Non-Inverter','2',1.87,22520,2650,8.4981132075471706,19619,3080,6.3698051948051946,7.3199999999999994,'Split_Wall_Mounted LG 1.87TR SEER 7.32','Split_Wall_Mounted LG 1.79TR SEER 7.34'),
('Split_Wall_Mounted','Gree','GW24QE-D3NTB4F/I','Non-Inverter','2',1.84,22100,1880,11.75531914893617,18700,2255,8.2926829268292686,9.94,'Split_Wall_Mounted Gree 1.84TR SEER 9.94','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Gree','GWH36LB-D3NTB2A/I','Non-Inverter','2.5',2.5,30000,2540,11.811023622047244,25200,2960,8.513513513513514,10.039999999999999,'Split_Wall_Mounted Gree 2.5TR SEER 10.04','Split_Wall_Mounted LG 2.5TR SEER 10.43'),
('Split_Wall_Mounted','Gree','GWH36QE-D3NTB4A/I','Non-Inverter','2',2.19,26300,2230,11.79372197309417,22800,2680,8.5074626865671643,10.049999999999999,'Split_Wall_Mounted Gree 2.19TR SEER 10.05','Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','Gree','GWC24AGEXF-D3NTA1C/I','Non-Inverter','2',1.83,22200,1818,12.211221122112212,19400,2194,8.8422971741112129,10.42,'Split_Wall_Mounted Gree 1.83TR SEER 10.42','Split_Wall_Mounted Zamil 1.83TR SEER 10.42'),
('Split_Wall_Mounted','TACHIAIR','TC18H/7S16','Non-Inverter','1.5',1.45,17400,1510,11.523178807947019,14900,1730,8.6127167630057802,9.9,'Split_Wall_Mounted TACHIAIR 1.45TR SEER 9.9','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','WBOX','WBAC24HL','Non-Inverter','2',1.75,21000,1730,12.138728323699421,18600,2130,8.7323943661971839,10.35,'Split_Wall_Mounted WBOX 1.75TR SEER 10.35','Split_Wall_Mounted Carrier 1.79TR SEER 10.35'),
('Split_Wall_Mounted','Unix','18TCS','Non-Inverter','1.5',1.5,18000,1500,12,16100,1894,8.5005279831045399,10.199999999999999,'Split_Wall_Mounted Unix 1.5TR SEER 10.2','Split_Wall_Mounted General 1.5TR SEER 10.16'),
('Split_Wall_Mounted','Ugine','UASM36C','Non-Inverter','2.5',2.61,31400,2614,12.012241775057383,26800,3135,8.5486443381180219,10.19,'Split_Wall_Mounted Ugine 2.61TR SEER 10.19','Split_Wall_Mounted Zamil 2.62TR SEER 10.00'),
('Split_Wall_Mounted','Carrier','42XP090H3','Non-Inverter','2.5',2.37,28551,3160,9.0351265822784814,24500,3398,7.2101236021188937,7.8999999999999995,'Split_Wall_Mounted Carrier 2.37TR SEER 7.9','Split_Wall_Mounted Zamil 2.35TR SEER 9.85'),
('Split_Wall_Mounted','LG','LV-H362KLA3','Non-Inverter','3',2.92,35145,3600,9.7624999999999993,29685,4200,7.0678571428571431,8.31,'Split_Wall_Mounted LG 2.92TR SEER 8.31','Split_Wall_Mounted Carrier 2.75TR SEER 8.54'),
('Split_Wall_Mounted','Haier','HSY-18EA13(T3)','Non-Inverter','1.5',1.42,17100,1900,9,14700,2300,6.3913043478260869,7.63,'Split_Wall_Mounted Haier 1.42TR SEER 7.63','Split_Wall_Mounted Royal Temp 1.5TR SEER 7.67'),
('Split_Wall_Mounted','YONAN','KT3FR-24GW/X1a','Non-Inverter','2',2,24450,2054,11.903602726387536,20950,2464,8.5024350649350655,10.11,'Split_Wall_Mounted YONAN 2TR SEER 10.11','Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','Zamil','MAZ26CCXAD','Non-Inverter','2',1.99,23953,1832,13.074781659388647,20745,2278,9.10667251975417,11.03,'Split_Wall_Mounted Zamil 1.99TR SEER 11.03','Split_Wall_Mounted Zamil 2TR SEER 10.39'),
('Split_Wall_Mounted','LG','S182SC','Non-Inverter','1.5',1.45,17504,2000,8.7520000000000007,15354,2300,6.6756521739130434,7.58,'Split_Wall_Mounted LG 1.45TR SEER 7.58','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','Zamil','MAZ26CCXAD1','Non-Inverter','2',1.83,22000,1781,12.352610892756879,18398,2114,8.7029328287606429,10.43,'Split_Wall_Mounted Zamil 1.83TR SEER 10.43','Split_Wall_Mounted Zamil 1.83TR SEER 10.42'),
('Split_Wall_Mounted','STARWAY','STW 24K CR','Non-Inverter','2',1.9,22800,1880,12.127659574468085,19220,2210,8.6968325791855197,10.299999999999999,'Split_Wall_Mounted STARWAY 1.9TR SEER 10.3','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','Gree','GWH24ACE-D3NTA1C/I','Non-Inverter','2',1.83,22000,1865,11.796246648793566,18300,2200,8.3181818181818183,9.9599999999999991,'Split_Wall_Mounted Gree 1.83TR SEER 9.96','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Mando','M20T-18C','Non-Inverter','1.5',1.53,18400,1484,12.398921832884097,16200,1800,9,10.6,'Split_Wall_Mounted Mando 1.53TR SEER 10.6','Split_Wall_Mounted Zamil 1.49TR SEER 10.52'),
('Split_Wall_Mounted','LG','T3224C','Inverter','2.5',2.34,28184,2240,12.582142857142857,22383,2516,8.8962639109697932,10.59,'Split_Wall_Mounted LG 2.34TR SEER 10.59','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Samsung','AR24JRFNCWKN','Non-Inverter','1.5',1.66,20000,1600,12.5,16500,1900,8.6842105263157894,10.5,'Split_Wall_Mounted Samsung 1.66TR SEER 10.5','Split_Wall_Mounted Zamil 1.49TR SEER 10.52'),
('Split_Wall_Mounted','Mando','AC-MD-24H-FW','Non-Inverter','2',1.71,20545,1739,11.814261069580219,17577,2105,8.3501187648456057,10,'Split_Wall_Mounted Mando 1.71TR SEER 10','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','Mando','KFR-51QW/a','Non-Inverter','1.5',1.45,17400,1810,9.6132596685082881,14300,1960,7.295918367346939,8.27,'Split_Wall_Mounted Mando 1.45TR SEER 8.27','Split_Wall_Mounted LG 1.53TR SEER 8.30'),
('Split_Wall_Mounted','Daewoo','DSA-183LH','Non-Inverter','1.5',1.5,18000,2000,9,15200,2300,6.6086956521739131,7.6899999999999995,'Split_Wall_Mounted Daewoo 1.5TR SEER 7.69','Split_Wall_Mounted Royal Temp 1.5TR SEER 7.67'),
('Split_Wall_Mounted','Mando','S-030H/hr','Non-Inverter','2.5',2.5,30000,2800,10.714285714285714,27000,3200,8.4375,9.3699999999999992,'Split_Wall_Mounted Mando 2.5TR SEER 9.37','Split_Wall_Mounted LG 2.58TR SEER 9.72'),
('Split_Wall_Mounted','LG','S242NHU52','Non-Inverter','2',1.83,22000,2640,8.3333333333333339,18920,3250,5.8215384615384611,7.04,'Split_Wall_Mounted LG 1.83TR SEER 7.04','Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','Mando','KT3FR-81W/S','Non-Inverter','2',1.68,20200,1750,11.542857142857143,17700,2130,8.3098591549295779,9.84,'Split_Wall_Mounted Mando 1.68TR SEER 9.84','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','SKM','MSKM410A-24HEP8','Non-Inverter','2',1.83,22000,1803,12.201885745978924,18500,2164,8.5489833641404811,10.29,'Split_Wall_Mounted SKM 1.83TR SEER 10.29','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','SKM','MSKM410A-18CEP8','Non-Inverter','1.5',1.5,18000,1488,12.096774193548388,15900,1849,8.5992428339643059,10.28,'Split_Wall_Mounted SKM 1.5TR SEER 10.28','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','York','YJGE24YH3CHLO-5','Non-Inverter','2',1.83,22000,1818,12.101210121012102,19000,2223,8.5470085470085468,10.25,'Split_Wall_Mounted York 1.83TR SEER 10.25','Split_Wall_Mounted LG 1.83TR SEER 10.27'),
('Split_Wall_Mounted','Ugine','UASM24H','Non-Inverter','2',1.83,22000,1781,12.352610892756879,18400,2114,8.7038789025543988,10.43,'Split_Wall_Mounted Ugine 1.83TR SEER 10.43','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Haam','HM30HSM22GO','Non-Inverter','2',2.25,27000,2180,12.385321100917432,23800,2615,9.1013384321223718,10.62,'Split_Wall_Mounted Haam 2.25TR SEER 10.62','Split_Wall_Mounted Okia 2.25TR SEER 10.59'),
('Split_Wall_Mounted','Zamil','TRL18CDACIED1','Non-Inverter','1.5',1.5,18000,1488,12.096774193548388,15600,1814,8.5997794928335178,10.27,'Split_Wall_Mounted Zamil 1.5TR SEER 10.27','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','York','YHGE18YT3CFEO-4','Non-Inverter','1.5',1.5,18000,1450,12.413793103448276,15300,1760,8.6931818181818183,10.48,'Split_Wall_Mounted York 1.5TR SEER 10.48','Split_Wall_Mounted LG 1.5TR SEER 10.46'),
('Split_Wall_Mounted','RAVO','RV20T-24C','Non-Inverter','2',1.75,21000,1750,12,18900,2100,9,10.36,'Split_Wall_Mounted RAVO 1.75TR SEER 10.36','Split_Wall_Mounted Giant 1.75TR SEER 10.36'),
('Split_Wall_Mounted','Giant','GIANT-30C','Non-Inverter','2',2.23,26800,2161,12.401665895418787,22200,2552,8.6990595611285269,10.45,'Split_Wall_Mounted Giant 2.23TR SEER 10.45','Split_Wall_Mounted LG 2.33TR SEER 10.46'),
('Split_Wall_Mounted','TIT','TIS-2420C','Non-Inverter','2',1.83,22000,1775,12.394366197183098,19000,2200,8.6363636363636367,10.459999999999999,'Split_Wall_Mounted TIT 1.83TR SEER 10.46','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','General','GC-24KFC','Non-Inverter','2',1.75,21000,1750,12,18900,2100,9,10.36,'Split_Wall_Mounted General 1.75TR SEER 10.36','Split_Wall_Mounted Giant 1.75TR SEER 10.36'),
('Split_Wall_Mounted','Falcon','RGS24H','Non-Inverter','2',2,24000,2630,9.1254752851711025,21508,3850,5.5864935064935066,7.43,'Split_Wall_Mounted Falcon 2TR SEER 7.43','Split_Wall_Mounted Zamil 1.83TR SEER 7.51'),
('Split_Wall_Mounted','Dansat','DSH18C','Non-Inverter','1.5',1.5,18000,1500,12,15000,1720,8.720930232558139,10.209999999999999,'Split_Wall_Mounted Dansat 1.5TR SEER 10.21','Split_Wall_Mounted Ugine 1.48TR SEER 10.23'),
('Split_Wall_Mounted','Gree','GWH24ACE-D3NTA1A/O','Non-Inverter','2',1.83,22000,1880,11.702127659574469,18300,2200,8.3181818181818183,9.9,'Split_Wall_Mounted Gree 1.83TR SEER 9.9','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','GoldStar','Model 01GoldStar','Non-Inverter','2',2,24000,2500,9.6,19600,3000,6.5333333333333332,8.02,'Split_Wall_Mounted GoldStar 2TR SEER 8.02','Split_Wall_Mounted Zamil 2.12TR SEER 8.09'),
('Split_Wall_Mounted','QUEEN','HQSif20C','Non-Inverter','1',1,12000,1000,12,10200,1200,8.5,10.16,'Split_Wall_Mounted QUEEN 1TR SEER 10.16','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Smart_Electric','SMELE24C','Non-Inverter','2',1.91,23000,1855,12.398921832884097,19800,2275,8.7032967032967026,10.48,'Split_Wall_Mounted Smart_Electric 1.91TR SEER 10.48','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','York','YHFE12XT3CFE-R3','Non-Inverter','1',0.99,11900,975,12.205128205128204,10000,1150,8.695652173913043,10.34,'Split_Wall_Mounted York 0.99TR SEER 10.34','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Hisense','AS-18CTS','Non-Inverter','1.5',1.5,18000,1485,12.121212121212121,15600,1785,8.7394957983193269,10.33,'Split_Wall_Mounted Hisense 1.5TR SEER 10.33','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','LG','NV242C1','Inverter','1.5',1.66,20000,1613,12.399256044637323,17000,1954,8.7001023541453435,10.47,'Split_Wall_Mounted LG 1.66TR SEER 10.47','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Haam','HM24C/7S15','Non-Inverter','2',1.73,20800,1800,11.555555555555555,16700,2000,8.35,9.7899999999999991,'Split_Wall_Mounted Haam 1.73TR SEER 9.79','Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','EMJOI','UESA-24C6','Non-Inverter','2',1.75,21040,1815,11.59228650137741,17060,2055,8.3017031630170308,9.81,'Split_Wall_Mounted EMJOI 1.75TR SEER 9.81','Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','Carrier','38QHA024HS','Non-Inverter','2',1.79,21500,1780,12.078651685393259,18400,2140,8.5981308411214954,10.25,'Split_Wall_Mounted Carrier 1.79TR SEER 10.25','Split_Wall_Mounted LG 1.83TR SEER 10.27'),
('Split_Wall_Mounted','Zamil','MFZ24CHXFW','Non-Inverter','2',1.83,22000,1905,11.548556430446194,18500,2229,8.299685957828622,9.81,'Split_Wall_Mounted Zamil 1.83TR SEER 9.81','Split_Wall_Mounted LG 1.99TR SEER 9.80'),
('Split_Wall_Mounted','York','YK9FXC024BAH-AX','Non-Inverter','2',1.83,22000,1850,11.891891891891891,19500,2250,8.6666666666666661,10.18,'Split_Wall_Mounted York 1.83TR SEER 10.18','Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','Mando','MP-SER-24C','Non-Inverter','2',1.83,22000,1781,12.352610892756879,18200,2128,8.5526315789473681,10.37,'Split_Wall_Mounted Mando 1.83TR SEER 10.37','Split_Wall_Mounted Giant 1.75TR SEER 10.36'),
('Split_Wall_Mounted','Zamil','MFZ24CCXFW','Non-Inverter','2',1.84,22100,1922,11.49843912591051,19000,2289,8.3005679335954561,9.7899999999999991,'Split_Wall_Mounted Zamil 1.84TR SEER 9.79','Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','Craft','DSA30CE6YHA1','Non-Inverter','2',2.25,27000,2230,12.107623318385651,23200,2680,8.656716417910447,10.29,'Split_Wall_Mounted Craft 2.25TR SEER 10.29','Split_Wall_Mounted Zamil 2.24TR SEER 10.35'),
('Split_Wall_Mounted','LG','S322GC','Non-Inverter','2',2.25,27000,3210,8.4112149532710276,23750,3690,6.436314363143631,7.29,'Split_Wall_Mounted LG 2.25TR SEER 7.29','Split_Wall_Mounted LG 2.25TR SEER 7.28'),
('Split_Wall_Mounted','Zamil','MMZ36CCXAD','Non-Inverter','2.5',2.6,31300,2614,11.97398622800306,26900,3135,8.5805422647527916,10.18,'Split_Wall_Mounted Zamil 2.6TR SEER 10.18','Split_Wall_Mounted Zamil 2.62TR SEER 10.00'),
('Split_Wall_Mounted','York','YHFE24YT3VFEO-3 / YHFE24XT3CFE-R3','Non-Inverter','2',1.91,23000,1870,12.299465240641711,19800,2275,8.7032967032967026,10.42,'Split_Wall_Mounted York 1.91TR SEER 10.42','Split_Wall_Mounted Zamil 1.83TR SEER 10.42'),
('Split_Wall_Mounted','York','YHGE24YT2BFEO-3 / YHGE24XT2BFE-R3','Non-Inverter','2',1.91,23000,1925,11.948051948051948,19800,2290,8.6462882096069862,10.18,'Split_Wall_Mounted York 1.91TR SEER 10.18','Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','York','YK9FYH024BAH-AAX / YK9FXH024BAH--AX','Non-Inverter','2',1.83,22000,1850,11.891891891891891,19500,2250,8.6666666666666661,10.18,'Split_Wall_Mounted York 1.83TR SEER 10.18','Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','York','MP920-18H / MP920-18H','Non-Inverter','1.5',1.5,18000,1452,12.396694214876034,15900,1767,8.9983022071307293,10.6,'Split_Wall_Mounted York 1.5TR SEER 10.6','Split_Wall_Mounted Zamil 1.49TR SEER 10.52'),
('Split_Wall_Mounted','York','YE5SD180SHZW22 / YE5HC18SH7BC22','Non-Inverter','1.5',1.41,17000,1783,9.5344924284913066,15141,2204,6.8697822141560803,8.14,'Split_Wall_Mounted York 1.41TR SEER 8.14','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','York','Y182SH','Non-Inverter','1.5',1.51,18238,1900,9.5989473684210527,15170,2200,6.8954545454545455,8.15,'Split_Wall_Mounted York 1.51TR SEER 8.15','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','York','Y242SC / X242SC','Non-Inverter','2',1.74,20985,2200,9.538636363636364,18254,2600,7.0207692307692309,8.18,'Split_Wall_Mounted York 1.74TR SEER 8.18','Split_Wall_Mounted LG 1.74TR SEER 8.17'),
('Split_Wall_Mounted','York','X242SH','Non-Inverter','2',1.71,20541,2160,9.5097222222222229,17743,2530,7.0130434782608697,8.15,'Split_Wall_Mounted York 1.71TR SEER 8.15','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','LG','B2424C / B2424C','Non-Inverter','2',1.82,21853,1900,11.50157894736842,18955,2290,8.2772925764192138,9.7999999999999989,'Split_Wall_Mounted LG 1.82TR SEER 9.8','Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','BOSCH','B2428C / B2428C','Non-Inverter','2',1.77,21340,1855,11.504043126684635,18443,2230,8.2704035874439459,9.7899999999999991,'Split_Wall_Mounted BOSCH 1.77TR SEER 9.79','Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','LG','BC18CCL / BC18CCL','Non-Inverter','1.5',1.49,17913,1480,12.103378378378379,15354,1780,8.6258426966292134,10.27,'Split_Wall_Mounted LG 1.49TR SEER 10.27','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','York','AR24HCFNBWKX / AR24HCFNBWKN','Non-Inverter','2',1.93,23200,2340,9.9145299145299148,20230,2700,7.4925925925925929,8.56,'Split_Wall_Mounted York 1.93TR SEER 8.56','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','BOSCH','AMBC36CCN','Non-Inverter','3',2.71,32600,2630,12.395437262357415,28400,3150,9.0158730158730158,10.59,'Split_Wall_Mounted BOSCH 2.71TR SEER 10.59','Split_Wall_Mounted LG 2.5TR SEER 10.43'),
('Split_Wall_Mounted','SAMSUNG','WBAC18LH','Non-Inverter','1.5',1.44,17300,1400,12.357142857142858,14700,1680,8.75,10.459999999999999,'Split_Wall_Mounted SAMSUNG 1.44TR SEER 10.46','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','LG','S242MH','Non-Inverter','2',2,24000,2500,9.6,20063,3035,6.6105436573311369,8.06,'Split_Wall_Mounted LG 2TR SEER 8.06','Split_Wall_Mounted Zamil 2.12TR SEER 8.09'),
('Split_Wall_Mounted','ACB','LSAC-24H/A','Non-Inverter','2',2,24000,2500,9.6,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','LG','LS-K1822HL','Non-Inverter','1.5',1.5,18000,1800,10,null,null,null,null,null,'Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','TCL','TAC-18CS/E7','Non-Inverter','1.5',1.46,17530,1510,11.609271523178808,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','MTC','MTC24CT20N','Non-Inverter','2',1.75,21000,1750,12,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','STARWAY','PTSW24HC','Non-Inverter','2',1.79,21500,1823,11.793746571585299,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','TIT','TIS18CH','Non-Inverter','1.5',1.46,17530,1510,11.609271523178808,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Gree','GWH24ACE-D3NTA1G/I','Non-Inverter','2',1.87,22500,1836.7346938775511,12.25,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Zamil','ASTW-H36A2/EW-5','Non-Inverter','3',3,36000,3600,10,null,null,null,null,null,'Split_Wall_Mounted Carrier 2.75TR SEER 8.81'),
('Split_Wall_Mounted','Gree','GWC18QD-D3NTB4D/I','Non-Inverter','1.5',1.5,18000,1525,11.803278688524591,14900,1773,8.4038353073886061,9.99,'Split_Wall_Mounted Gree 1.5TR SEER 9.99','Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','Fuji','FANP24FVSWHE','Non-Inverter','2',1.83,22000,1850,11.891891891891891,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Fuji','RSA-24RAT','Non-Inverter','2',1.88,22600,2520,8.9682539682539684,null,null,null,null,null,'Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','General','GAC-SF2412HT','Non-Inverter','2',1.83,22000,1850,11.891891891891891,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Gree','GWH18ACD-D3NTA1G/I','Non-Inverter','1.5',1.5,18000,1465,12.286689419795222,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Fisher','FSAC-FT18CERA','Non-Inverter','2',1.91,23000,1917,11.997913406364111,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Samsung','AQ24FC','Non-Inverter','1.5',1.65,19841,2040,9.7259803921568633,null,null,null,null,null,'Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Mando','AC-18H-T7','Non-Inverter','1.5',1.5,18000,1516,11.87335092348285,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Ravo','RV20T-24H','Non-Inverter','2',1.75,21000,1721,12.20220801859384,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Mando','MP-24CDN','Non-Inverter','2',1.78,21400,1754,12.200684150513112,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Daewoo','DSA-F1883EL-T','Non-Inverter','1.5',1.5,18000,1485,12.121212121212121,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','General_Supreme','GST1888C','Non-Inverter','1.5',1.44,17300,1407,12.295664534470504,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Gree','GWH24AGE-D3NTAIA/I','Non-Inverter','2',1.87,22500,1837,12.248230811105062,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Gree','GWH18AGD-D3NTA1A/I','Non-Inverter','1.5',1.5,18000,1464,12.295081967213115,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Gree','GWC18AACD-D3NTA1G/I','Non-Inverter','1.5',1.5,18000,1482,12.145748987854251,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','QUEEN','HQHS120C','Non-Inverter','1',0.99,11900,978,12.167689161554192,null,null,null,null,null,'Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Speed_Cool','SL24HC','Non-Inverter','2',2,24000,2500,9.6,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','LG','LS-H182TLB1','Non-Inverter','1.5',1.5,18000,1900,9.473684210526315,null,null,null,null,null,'Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','General','GC-18CT/S23','Non-Inverter','1',1,12000,1000,12,null,null,null,null,null,'Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Lakes','KT3F-51GW','Non-Inverter','1.5',1.5,18000,2150,8.3720930232558146,null,null,null,null,null,'Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','Gree','KT3F-45G/J','Non-Inverter','1.5',1.5,18000,2150,8.3720930232558146,null,null,null,null,null,'Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','MTC','MTC30H/7S-T18','Non-Inverter','2',2.2000000000000002,26500,2244,11.809269162210338,null,null,null,null,null,'Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','Daewoo','DSA-183LH-R','Non-Inverter','1.5',1.5,18000,2000,9,15200,2300,6.6086956521739131,7.6899999999999995,'Split_Wall_Mounted Daewoo 1.5TR SEER 7.69','Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','LG','S182NH ST0','Non-Inverter','1.5',1.5,18017.094017094016,2080,8.6620644312951995,15500,2370,6.5400843881856536,7.47,'Split_Wall_Mounted LG 1.5TR SEER 7.47','Split_Wall_Mounted LG 1.46TR SEER 7.56'),
('Split_Wall_Mounted','MTC','MTC24H/7S-T18','Non-Inverter','2',1.82,21850,1850,11.810810810810811,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','LS-K1827CM','Non-Inverter','1.5',1.5,18000,2000,9,null,null,null,null,null,'Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','Gree','GWH28ACE-D3NTA1G/I','Non-Inverter','2',2.2599999999999998,27200,2266,12.003530450132391,null,null,null,null,null,'Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','Samsung','AQ24UUPNUMG','Non-Inverter','2',2,24000,2060,11.650485436893204,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Samsung','24CKK01L','Non-Inverter','2',2,24000,2600,9.2307692307692299,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','LUNA','LACX18H-1M','Non-Inverter','1.5',1.48,17800,1460,12.191780821917808,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Mando','KT3FR-61GW/S','Non-Inverter','2',1.73,20200,1750,11.542857142857143,17700,2130,8.3098591549295779,9.84,'Split_Wall_Mounted Mando 1.73TR SEER 9.84','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','LG','S242NH ST0','Non-Inverter','2',1.91,22997,2630,8.7441064638783264,20063,3035,6.6105436573311369,7.55,'Split_Wall_Mounted LG 1.91TR SEER 7.55','Split_Wall_Mounted LG 1.91TR SEER 7.54'),
('Split_Wall_Mounted','LG','LS-T242CBG','Non-Inverter','2',2,24000,2525,9.5049504950495045,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','Gree','GWC24QE-D3NTB4A/I','Non-Inverter','2',1.83,22000,1880,11.702127659574469,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','CRONY','ASTW-H12A2/ET','Non-Inverter','1',0.94,11282.051282051281,1300,8.6785009861932938,null,null,null,null,null,'Split_Wall_Mounted LG 0.95TR SEER 8.3'),
('Split_Wall_Mounted','LG','LS-T182CBG','Non-Inverter','1.5',1.5,18000,1700,10.588235294117647,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.52'),
('Split_Wall_Mounted','LG','LS-H182TNB0','Non-Inverter','1.5',1.5,18000,1860,9.67741935483871,16000,2150,7.441860465116279,8.41,'Split_Wall_Mounted LG 1.5TR SEER 8.41','Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','General','GC-18CT/S24','Non-Inverter','1.5',1.5,18000,1764,10.204081632653061,null,null,null,null,null,'Split_Wall_Mounted Ugine 1.48TR SEER 10.23'),
('Split_Wall_Mounted','Gree','GWCN18DETD1A4A/I','Non-Inverter','1.5',1.5,18000,1525,11.803278688524591,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Ugine','UASG12H','Non-Inverter','1',0.96,11600,970.7,11.950139074894405,null,null,null,null,null,'Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Midea','MSTE-24HR','Non-Inverter','2',1.79,21538.461538461539,2533,8.5031431261198342,null,null,null,null,null,'Split_Wall_Mounted Carrier 1.79TR SEER 8.31'),
('Split_Wall_Mounted','General','GC-18-KFC','Non-Inverter','1.5',1.5,18000,1500,12,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','General','GC-18CT/524','Non-Inverter','1.5',1.5,18000,1500,12,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Unix','GSDAD30H','Non-Inverter','2',1.9,22861,2787,8.2027269465374957,null,null,null,null,null,'Split_Wall_Mounted LG 1.74TR SEER 8.20'),
('Split_Wall_Mounted','York','HTKA18OS-ADR','Non-Inverter','1.5',1.5,18000,2080,8.6538461538461533,null,null,null,null,null,'Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','LG','S182DH','Non-Inverter','1.5',1.41,17026,2100,8.1076190476190479,14672,2450,5.9885714285714284,6.95,'Split_Wall_Mounted LG 1.41TR SEER 6.95','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','Comfort','MSAC-24CHS/GT2','Non-Inverter','2',1.83,22000,2767,7.9508492952656304,null,null,null,null,null,'Split_Wall_Mounted Carrier 1.81TR SEER 7.91'),
('Split_Wall_Mounted','Mando','AC-24C-T7','Non-Inverter','2',1.83,22000,1867,11.783610069630424,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','S322GH','Non-Inverter','2',2.21,26529.914529914535,3050,8.6983326327588646,23270,3570,6.5182072829131652,7.5,'Split_Wall_Mounted LG 2.21TR SEER 7.5','Split_Wall_Mounted LG 2.21TR SEER 7.49'),
('Split_Wall_Mounted','Gree','GWC24AGE-D3NTA1Y/I','Non-Inverter','2',1.84,22100,1865,11.849865951742627,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','queen','HQSG1248H6','Non-Inverter','2',1.87,22500,1899,11.848341232227488,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','B2424H','Non-Inverter','2',1.74,20950.551879999999,1820,11.511292241758241,18937,2280,8.3057017543859644,9.84,'Split_Wall_Mounted LG 1.74TR SEER 9.84','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','LG','Y182SC','Non-Inverter','1.5',1.54,18562,1950,9.5189743589743596,16037,2300,6.9726086956521742,8.14,'Split_Wall_Mounted LG 1.54TR SEER 8.14','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','Fuji','ROA24UMTAHS','Non-Inverter','2',2.29,27500,2300,11.956521739130435,null,null,null,null,null,'Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','Gree','GWC18ACD-D3NTA1G/I.','Non-Inverter','2',1.87,22500,1850,12.162162162162161,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','LS-K2424HL','Non-Inverter','2',2,24000,2525,9.5049504950495045,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','LG','T2428P','Non-Inverter','2',1.92,23042.735042735047,2550,9.0363666834255092,20653,3000,6.8843333333333332,7.84,'Split_Wall_Mounted LG 1.92TR SEER 7.84','Split_Wall_Mounted DAEWOO 2TR SEER 7.86'),
('Split_Wall_Mounted','Samsung','AQ24UUPX','Non-Inverter','2',1.83,22051.282051282054,2500,8.8205128205128212,null,null,null,null,null,'Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','HomeQueen','HQSG240H','Non-Inverter','2',1.79,21500,1792,11.997767857142858,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Midea','MOU-18CN1','Non-Inverter','1.5',1.5,18000,2020,8.9108910891089117,null,null,null,null,null,'Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','Samsung','LH2012033939','Non-Inverter','2',2,24000,2424,9.9009900990099009,null,null,null,null,null,'Split_Wall_Mounted Carrier 1.92TR SEER 9.83'),
('Split_Wall_Mounted','Gree','GWH18AGDXFD3NTA1G/I','Non-Inverter','1.5',1.54,18500,1762,10.499432463110102,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.52'),
('Split_Wall_Mounted','Gree','GWH12AGC-D3NTA1A/I','Non-Inverter','1',0.96,11600,1450,8,null,null,null,null,null,'Split_Wall_Mounted LG 0.95TR SEER 7.9'),
('Split_Wall_Mounted','General','KSGS183GE','Non-Inverter','1.5',1.5,18000,2613,6.8886337543053964,null,null,null,null,null,'Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','York','YHGE24XT3CFE','Non-Inverter','2',1.91,23000,1925,11.948051948051948,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Falcon','HBPU-3601','Non-Inverter','2.5',2.5,30000,2440,12.295081967213115,null,null,null,null,null,'Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','LG','X242EC','Non-Inverter','2',1.83,22008.315900000001,2200,10.003779954545456,18254.959699999999,2600,7.0211383461538457,8.43,'Split_Wall_Mounted LG 1.83TR SEER 8.43','Split_Wall_Mounted Carrier 1.79TR SEER 8.31'),
('Split_Wall_Mounted','LG','LS-T242CB','Non-Inverter','2',2,24000,2525,9.5049504950495045,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','Falcon','FGS24C','Non-Inverter','2',1.83,22000,2315,9.5032397408207352,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','LG','LS-C322MMB0','Non-Inverter','2.5',2.66,32000,3350,9.5522388059701484,null,null,null,null,null,'Split_Wall_Mounted LG 2.58TR SEER 9.72'),
('Split_Wall_Mounted','LG','LS-K1822CL','Non-Inverter','1.5',1.5,18000,1900,9.473684210526315,null,null,null,null,null,'Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','Rowa','CS-RW18H','Non-Inverter','1.5',1.46,17530,1510,11.609271523178808,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','ACB','LSAC-24H','Non-Inverter','2',2,24000,2500,9.6,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','Gibson','SXSA24CE73Y1','Non-Inverter','2',2.25,27000,2213,12.200632625395391,null,null,null,null,null,'Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','Carrier','42EGQ024-3','Non-Inverter','2',1.75,21000,2330,9.0128755364806867,null,null,null,null,null,'Split_Wall_Mounted Carrier 1.79TR SEER 8.31'),
('Split_Wall_Mounted','Carrier','42QBL025-3','Non-Inverter','2',2,24000,2770,8.6642599277978345,null,null,null,null,null,'Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','Trane','MCW524S100RA','Non-Inverter','2',1.83,22000,2600,8.4615384615384617,null,null,null,null,null,'Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','KOOLEN','KOACS18KHC','Non-Inverter','1.5',1.49,17900,1486,12.045760430686407,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','LG','LS-K2422HL','Non-Inverter','2',2,24000,2525,9.5049504950495045,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','Gaint','GNT12CCG','Non-Inverter','1',0.88,10577,900,11.752222222222223,null,null,null,null,null,'Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','LG','LS-M3221AL','Non-Inverter','2.5',2.66,32000,3350,9.5522388059701484,null,null,null,null,null,'Split_Wall_Mounted LG 2.58TR SEER 9.72'),
('Split_Wall_Mounted','Caus','CAUS-24HRF1','Non-Inverter','2',2,24000,3000,8,null,null,null,null,null,'Split_Wall_Mounted Carrier 1.81TR SEER 7.91'),
('Split_Wall_Mounted','LG','LS-H322MMBO','Non-Inverter','2.5',2.66,32000,3200,10,null,null,null,null,null,'Split_Wall_Mounted Zamil 2.62TR SEER 10.00'),
('Split_Wall_Mounted','Mando','F19M-24HT','Non-Inverter','2',1.8,21600,1742,12.399540757749714,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','LS-T244CBG','Non-Inverter','2',2,24000,2525,9.5049504950495045,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.99TR SEER9.77')
on conflict (equipment_type, model_no) do update set
  make = excluded.make,
  compressor_type = excluded.compressor_type,
  size_category = excluded.size_category,
  tr = excluded.tr,
  t1_btu = excluded.t1_btu,
  t1_w = excluded.t1_w,
  t1_eer = excluded.t1_eer,
  t3_btu = excluded.t3_btu,
  t3_w = excluded.t3_w,
  t3_eer = excluded.t3_eer,
  equivalent_seer = excluded.equivalent_seer,
  surveyed_unit_description = excluded.surveyed_unit_description,
  equivalent_ac_model_description = excluded.equivalent_ac_model_description
where (t.make, t.compressor_type, t.size_category, t.tr, t.t1_btu, t.t1_w, t.t1_eer, t.t3_btu, t.t3_w, t.t3_eer, t.equivalent_seer, t.surveyed_unit_description, t.equivalent_ac_model_description)
   is distinct from (excluded.make, excluded.compressor_type, excluded.size_category, excluded.tr, excluded.t1_btu, excluded.t1_w, excluded.t1_eer, excluded.t3_btu, excluded.t3_w, excluded.t3_eer, excluded.equivalent_seer, excluded.surveyed_unit_description, excluded.equivalent_ac_model_description);

-- >>> CHUNK 4/11 — old_model_registry rows 601-800 of 1516
insert into public.old_model_registry as t (equipment_type, make, model_no, compressor_type, size_category, tr, t1_btu, t1_w, t1_eer, t3_btu, t3_w, t3_eer, equivalent_seer, surveyed_unit_description, equivalent_ac_model_description) values
('Split_Wall_Mounted','Kelvinator','KTS18H','Non-Inverter','1.5',1.5,18000,1500,12,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Classic','ADO18CHXOW','Non-Inverter','1.5',1.47,17700,1532,11.553524804177545,14798,1783,8.2994952327537863,9.81,'Split_Wall_Mounted Classic 1.47TR SEER 9.81','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','LG','S242KH','Non-Inverter','2',2,24000,2450,9.795918367346939,19278,2850,6.7642105263157895,8.1999999999999993,'Split_Wall_Mounted LG 2TR SEER 8.2','Split_Wall_Mounted Zamil 1.95TR SEER 8.11'),
('Split_Wall_Mounted','Samsung','24000BTU','Non-Inverter','2',2,24000,2424,9.9009900990099009,null,null,null,null,null,'Split_Wall_Mounted Carrier 1.92TR SEER 9.83'),
('Split_Wall_Mounted','Carrier','42QKA0243P','Non-Inverter','2',1.79,21500,1762,12.202043132803633,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Mando','AC-30H-T7','Non-Inverter','2',2.2000000000000002,26500,2244,11.809269162210338,null,null,null,null,null,'Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','Ravo','RV-20T-24','Non-Inverter','2',1.75,21059.829059829062,1721,12.236972144002941,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','koolen','Koacs12khc','Non-Inverter','1',0.96,11600,1143,10.148731408573928,null,null,null,null,null,'Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Carrier','42QHDO-24','Non-Inverter','2',1.75,21000,2386,8.8013411567476947,null,null,null,null,null,'Split_Wall_Mounted Carrier 1.79TR SEER 8.31'),
('Split_Wall_Mounted','Super_General','KSG243GE','Non-Inverter','2',1.75,21000,1750,12,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Midea','MSTE-18HR-E1','Non-Inverter','1.5',1.39,16752.136752136754,2042,8.203788811036608,null,null,null,null,null,'Split_Wall_Mounted LG 1.52TR SEER 8.15'),
('Split_Wall_Mounted','Fisher','FSAC-FT36CERA','Non-Inverter','2.5',2.6,31200,2537,12.297989751675207,null,null,null,null,null,'Split_Wall_Mounted LG 2.5TR SEER 10.43'),
('Split_Wall_Mounted','Falcon','FMS12H9','Non-Inverter','1',0.98,11800,952,12.394957983193278,null,null,null,null,null,'Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','TERIM','TRG24CS19N','Non-Inverter','2',1.83,22000,1864,11.802575107296137,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','YOKO','YOKO-24CH','Non-Inverter','2',1.84,22178,1912,11.599372384937238,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Super_General','KSG311GER','Non-Inverter','2',2.2000000000000002,26400,2129,12.400187881634571,null,null,null,null,null,'Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','Mando','AC-24H-T7','Non-Inverter','2',1.83,22050,1856.3731267890216,11.878,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Fuji','RSA30LMTA-9','Non-Inverter','2',2.29,27500,2300,11.956521739130435,null,null,null,null,null,'Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','Falcon','ACSU24N','Non-Inverter','2',2,24000,2770,8.6642599277978345,null,null,null,null,null,'Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','Craft','DSSA32EE7','Non-Inverter','2.5',2.5,30000,3450,8.695652173913043,null,null,null,null,null,'Split_Wall_Mounted Fuji 2.2TR SEER 8.66'),
('Split_Wall_Mounted','LG','S122DH','Non-Inverter','1',1,12000,1150,10.434782608695652,9383,1300,7.2176923076923076,8.73,'Split_Wall_Mounted LG 1TR SEER 8.73','Split_Wall_Mounted LG 0.95TR SEER 8.3'),
('Split_Wall_Mounted','LG','LS-R122AAG','Non-Inverter','1',1,12000,1220,9.8360655737704921,null,null,null,null,null,'Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Haam','HM24C5M20','Non-Inverter','2',1.83,22000,1781.37,12.350045189938083,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Mando','F19M-12CT','Non-Inverter','1',1.05,12600,1024,12.3046875,null,null,null,null,null,'Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Ugine','UGN12','Non-Inverter','1',0.93,11260,1237,9.1026677445432504,null,null,null,null,null,'Split_Wall_Mounted LG 0.95TR SEER 8.3'),
('Split_Wall_Mounted','Mando','F19M-30CT','Non-Inverter','2',2.23,26800,2161,12.401665895418787,null,null,null,null,null,'Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','Craft','DSXSA32FE7','Non-Inverter','2.5',2.5,30000,3450,8.695652173913043,null,null,null,null,null,'Split_Wall_Mounted Fuji 2.2TR SEER 8.66'),
('Split_Wall_Mounted','LG','LS-M3221BL','Non-Inverter','2.5',2.66,32000,3350,9.5522388059701484,null,null,null,null,null,'Split_Wall_Mounted LG 2.58TR SEER 9.72'),
('Split_Wall_Mounted','LG','S242SHU51','Non-Inverter','2',1.87,22520.137200000001,2640,8.5303550000000001,18947.5,3250,5.83,7.1499999999999995,'Split_Wall_Mounted LG 1.87TR SEER 7.15','Split_Wall_Mounted LG 1.87TR SEER 7.14'),
('Split_Wall_Mounted','Mando','F23TP-18CT','Non-Inverter','1.5',1.53,18400,1484,12.398921832884097,15300,1800,8.5,10.39,'Split_Wall_Mounted Mando 1.53TR SEER 10.39','Split_Wall_Mounted Mando 1.53TR SEER 10.38'),
('Split_Wall_Mounted','York','YTHA18OSAADA','Non-Inverter','1.5',1.5,18000,2094,8.595988538681949,null,null,null,null,null,'Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','Queen','HQ8G1240H6','Non-Inverter','2',1.87,22500,1875,12,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','GoldStar','Model.11GoldStar','Non-Inverter','2',2,24000,2500,9.6,19600,3000,6.5333333333333332,8.02,'Split_Wall_Mounted GoldStar 2TR SEER 8.02','Split_Wall_Mounted Zamil 2.12TR SEER 8.09'),
('Split_Wall_Mounted','LG','S322GHSD0','Non-Inverter','2.5',2.66,32000,3000,10.666666666666666,null,null,null,null,null,'Split_Wall_Mounted LG 2.5TR SEER 10.43'),
('Split_Wall_Mounted','Petra','Petra NA','Non-Inverter','2',1.79,21538.461538461539,2700,7.9772079772079776,null,null,null,null,null,'Split_Wall_Mounted Carrier 1.81TR SEER 7.91'),
('Split_Wall_Mounted','O2','O2- NA 1.83','Non-Inverter','2',1.83,22000,1781,12.352610892756879,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Carrier','38QKA0243','Non-Inverter','2',1.79,21500,1762,12.202043132803633,18500,2126,8.7017873941674502,10.36,'Split_Wall_Mounted Carrier 1.79TR SEER 10.36','Split_Wall_Mounted Carrier 1.79TR SEER 10.35'),
('Split_Wall_Mounted','Zamil','ADO36CHXCW','Non-Inverter','2.5',2.62,31499.573500142167,2669,11.802013300915013,27998.862667045778,3373,8.3008783477752086,10.01,'Split_Wall_Mounted Zamil 2.62TR SEER 10.01','Split_Wall_Mounted Zamil 2.62TR SEER 10.00'),
('Split_Wall_Mounted','York','S1ZI18300','Non-Inverter','1.5',1.5,18000,2000,9,null,null,null,null,null,'Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','York','NYVR243M-0S3','Non-Inverter','2',1.83,22000,2530,8.695652173913043,18470,2980,6.1979865771812079,7.37,'Split_Wall_Mounted York 1.83TR SEER 7.37','Split_Wall_Mounted LG 1.79TR SEER 7.34'),
('Split_Wall_Mounted','York','ANJ18BDC1T','Non-Inverter','1.5',1.5,18028,1857,9.7081313947226704,14465,2077,6.9643716899374093,8.2099999999999991,'Split_Wall_Mounted York 1.5TR SEER 8.21','Split_Wall_Mounted LG 1.52TR SEER 8.15'),
('Split_Wall_Mounted','York','S1ZDA18300 / S1ZI18300','Non-Inverter','1.5',1.5,18000,2000,9,null,null,null,null,null,'Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','LG','B1ZA18300 / B1ZDI18300','Non-Inverter','1.5',1.5,18000,2000,9,null,null,null,null,null,'Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','LG','S1ZDA24300 / S1ZDI24300','Non-Inverter','2',2,24000,2360,10.169491525423728,null,null,null,null,null,'Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','LG','E182EC','Non-Inverter','1.5',1.64,19738,2035.0000000000002,9.699262899262898,17488,2500,6.9951999999999996,8.2799999999999994,'Split_Wall_Mounted LG 1.64TR SEER 8.28','Split_Wall_Mounted LG 1.53TR SEER 8.30'),
('Split_Wall_Mounted','York','Z182EC SN4','Non-Inverter','1.5',1.5,18000,2110,8.5308056872037916,15320,2500,6.1280000000000001,7.25,'Split_Wall_Mounted York 1.5TR SEER 7.25','Split_Wall_Mounted LG 1.46TR SEER 7.28'),
('Split_Wall_Mounted','LG','LV-H24BLA3','Non-Inverter','2',2,24064,2200,10.938181818181818,21000,2600,8.0769230769230766,9.379999999999999,'Split_Wall_Mounted LG 2TR SEER 9.38','Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','Classic','KXC24CSICIQ - ADX24ECAXFQ','Non-Inverter','2',1.99,23993,3000,7.9976666666666665,19493,3290,5.9249240121580549,6.83,'Split_Wall_Mounted Classic 1.99TR SEER 6.83','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Classic','KXC24CSSHIV - ADU24CHAXFV','Non-Inverter','2',1.95,23498,2460,9.5520325203252039,20100,2935,6.8483816013628624,8.1199999999999992,'Split_Wall_Mounted Classic 1.95TR SEER 8.12','Split_Wall_Mounted Zamil 1.95TR SEER 8.11'),
('Split_Wall_Mounted','Classic','KRC24CDMCJOW2 - ADO24CCXOW2','Non-Inverter','2',1.92,23048,1937,11.898812596799173,18698,2174,8.6007359705611783,10.09,'Split_Wall_Mounted Classic 1.92TR SEER 10.09','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','Classic','KRC24CDSHJED1 - ADM24CHXED1','Non-Inverter','2',1.88,22600,1823,12.397147558968733,19500,2321,8.4015510555794908,10.379999999999999,'Split_Wall_Mounted Classic 1.88TR SEER 10.38','Split_Wall_Mounted Giant 1.75TR SEER 10.36'),
('Split_Wall_Mounted','Classic','KRC24CDMCJOW1 - ADO24CCXOW1','Non-Inverter','2',2.0299999999999998,24396,2113,11.545669663984855,19599,2361,8.3011435832274465,9.77,'Split_Wall_Mounted Classic 2.03TR SEER 9.77','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Gree','GWC24ACE-D3NTA1A/O','Non-Inverter','2',1.83,22000,1880,11.702127659574469,18300,2200,8.3181818181818183,9.9,'Split_Wall_Mounted Gree 1.83TR SEER 9.9','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Gree','GWC24QE-D3NTA1F/O','Non-Inverter','2',1.83,22000,1880,11.702127659574469,18700,2255,8.2926829268292686,9.91,'Split_Wall_Mounted Gree 1.83TR SEER 9.91','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Haier','HSU-24LZE13/R2','Non-Inverter','2',1.83,22000,1850,11.891891891891891,19500,2250,8.6666666666666661,10.18,'Split_Wall_Mounted Haier 1.83TR SEER 10.18','Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','LG','NT242C','Non-Inverter','2',1.83,22000,1833,12.002182214948173,18500,2126,8.7017873941674502,10.220000000000001,'Split_Wall_Mounted LG 1.83TR SEER 10.22','Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','LG','A242SC NC0','Non-Inverter','2',1.76,21189,1840,11.515760869565218,17981,2170,8.2861751152073726,9.7899999999999991,'Split_Wall_Mounted LG 1.76TR SEER 9.79','Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','LG','NC242C3','Inverter','2',2,24000,1832,13.100436681222707,22000,2417,9.1021928009929667,11.1,'Split_Wall_Mounted LG 2TR SEER 11.1','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Zamil','MRZ24CDGHIAW','Non-Inverter','2',1.9,22898,1982,11.552976791120081,19599,2360,8.3046610169491526,9.83,'Split_Wall_Mounted Zamil 1.9TR SEER 9.83','Split_Wall_Mounted Carrier 1.92TR SEER 9.83'),
('Split_Wall_Mounted','Zamil','KZC24CSPCIQ','Non-Inverter','2',1.85,22297,2850,7.8235087719298244,19697,3300,5.9687878787878788,6.7799999999999994,'Split_Wall_Mounted Zamil 1.85TR SEER 6.78','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','LG','S182DHN51','Non-Inverter','1.5',1.41,17025,2100,8.1071428571428577,14672,2450,5.9885714285714284,6.95,'Split_Wall_Mounted LG 1.41TR SEER 6.95','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','Ugine','UTS18LSHRN-7','Non-Inverter','1.5',1.5,18000,1525,11.803278688524591,14900,1773,8.4038353073886061,9.99,'Split_Wall_Mounted Ugine 1.5TR SEER 9.99','Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','York','YK9FXC018BAH-AX','Non-Inverter','1.5',1.5,18000,1500,12,16000,1720,9.3023255813953494,10.44,'Split_Wall_Mounted York 1.5TR SEER 10.44','Split_Wall_Mounted LG 1.5TR SEER 10.46'),
('Split_Wall_Mounted','York','YHGE18YT3CFEO-3','Non-Inverter','1.5',1.5,18000,1475,12.203389830508474,15000,1725,8.695652173913043,10.33,'Split_Wall_Mounted York 1.5TR SEER 10.33','Split_Wall_Mounted Mando 1.5TR SEER 10.35'),
('Split_Wall_Mounted','Zamil','KRZ18CDACIAD','Non-Inverter','1.5',1.5,18015,1374,13.111353711790393,15000,1765,8.4985835694050991,10.81,'Split_Wall_Mounted Zamil 1.5TR SEER 10.81','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Mando','AC-18C-MDE','Non-Inverter','1.5',1.53,18400,1560,11.794871794871796,16600,1860,8.9247311827956981,10.209999999999999,'Split_Wall_Mounted Mando 1.53TR SEER 10.21','Split_Wall_Mounted Ugine 1.48TR SEER 10.23'),
('Split_Wall_Mounted','Classic','KRC30CDSHJCW2 - ADO30CHXCW2','Non-Inverter','2',2.29,27497,2320,11.852155172413793,24198,2847,8.4994731296101165,10.1,'Split_Wall_Mounted Classic 2.29TR SEER 10.1','Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','LG','S122NCNE2','Non-Inverter','1',1,12010,1200,10.008333333333333,10577,1400,7.5549999999999997,8.64,'Split_Wall_Mounted LG 1TR SEER 8.64','Split_Wall_Mounted LG 0.95TR SEER 8.3'),
('Split_Wall_Mounted','LG','S322GCND4','Non-Inverter','2',2.2400000000000002,26989,3210,8.4077881619937695,23748,3690,6.435772357723577,7.29,'Split_Wall_Mounted LG 2.24TR SEER 7.29','Split_Wall_Mounted LG 2.25TR SEER 7.28'),
('Split_Wall_Mounted','LG','A3024CUV0','Non-Inverter','2',1.99,23986,2080,11.531730769230769,20779,2510,8.2784860557768916,9.81,'Split_Wall_Mounted LG 1.99TR SEER 9.81','Split_Wall_Mounted LG 1.99TR SEER 9.80'),
('Split_Wall_Mounted','LG','T3624CNV0','Non-Inverter','2.5',2.58,31015,2710,11.444649446494465,24805,2960,8.3800675675675684,9.73,'Split_Wall_Mounted LG 2.58TR SEER 9.73','Split_Wall_Mounted LG 2.58TR SEER 9.72'),
('Split_Wall_Mounted','Zamil','KRZ30CDGHIFW','Non-Inverter','2',2.1800000000000002,26197,2239,11.700312639571237,23000,2771,8.3002526163839772,9.93,'Split_Wall_Mounted Zamil 2.18TR SEER 9.93','Split_Wall_Mounted Zamil 2.35TR SEER 9.85'),
('Split_Wall_Mounted','Carrier','42KHA024HSN','Non-Inverter','2',1.83,22000,1781,12.352610892756879,18200,2128,8.5526315789473681,10.37,'Split_Wall_Mounted Carrier 1.83TR SEER 10.37','Split_Wall_Mounted Giant 1.75TR SEER 10.36'),
('Split_Wall_Mounted','Carrier','42EQG024-3','Non-Inverter','2',1.75,21000,2330,9.0128755364806867,null,null,null,null,null,'Split_Wall_Mounted Carrier 1.79TR SEER 8.31'),
('Split_Wall_Mounted','Carrier','42EGQ018-3','Non-Inverter','1.5',1.5,18000,1895,9.4986807387862804,null,null,null,null,null,'Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','Carrier','42KHC018-3B','Non-Inverter','1.5',1.5,18000,2022,8.9020771513353107,16200,2382,6.8010075566750627,7.7299999999999995,'Split_Wall_Mounted Carrier 1.5TR SEER 7.73','Split_Wall_Mounted Royal Temp 1.5TR SEER 7.67'),
('Split_Wall_Mounted','Carrier','42CKA0183P','Non-Inverter','1.5',1.5,18000,1475,12.203389830508474,15800,1756,8.9977220956719819,10.47,'Split_Wall_Mounted Carrier 1.5TR SEER 10.47','Split_Wall_Mounted LG 1.5TR SEER 10.46'),
('Split_Wall_Mounted','Carrier','42KHA018HSN-1','Non-Inverter','1.5',1.5,18000,1513,11.896893588896233,15500,1802,8.6015538290788012,10.14,'Split_Wall_Mounted Carrier 1.5TR SEER 10.14','Split_Wall_Mounted LG 1.47TR SEER 10.15'),
('Split_Wall_Mounted','Carrier','42KHB018HS','Non-Inverter','1.5',1.54,18500,1530,12.091503267973856,16500,1800,9.1666666666666661,10.47,'Split_Wall_Mounted Carrier 1.54TR SEER 10.47','Split_Wall_Mounted LG 1.5TR SEER 10.46'),
('Split_Wall_Mounted','Carrier','42KHB024HS','Non-Inverter','2',2,24000,1960,12.244897959183673,21000,2350,8.9361702127659566,10.47,'Split_Wall_Mounted Carrier 2TR SEER 10.47','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Carrier','42XPLO30H3P','Non-Inverter','2',2.25,27000,2260,11.946902654867257,24000,2700,8.8888888888888893,10.29,'Split_Wall_Mounted Carrier 2.25TR SEER 10.29','Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','General','ASSA18FMTA','Non-Inverter','1.5',1.55,18600,1610,11.552795031055901,15900,1920,8.28125,9.82,'Split_Wall_Mounted General 1.55TR SEER 9.82','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','Carrier','42KFH024-0S6','Non-Inverter','2',1.83,22000,1811,12.147984538928769,19000,2222,8.5508550855085517,10.28,'Split_Wall_Mounted Carrier 1.83TR SEER 10.28','Split_Wall_Mounted LG 1.83TR SEER 10.27'),
('Split_Wall_Mounted','York','HTEA24OS-ADR','Non-Inverter','2',2,24000,2650,9.0566037735849054,null,null,null,null,null,'Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','White Westinghouse','WWS18KDHI','Non-Inverter','1.5',1.5,18000,1485,12.121212121212121,15600,1785,8.7394957983193269,10.33,'Split_Wall_Mounted White Westinghouse 1.5TR SEER 10.33','Split_Wall_Mounted Mando 1.5TR SEER 10.35'),
('Split_Wall_Mounted','LG','S242DP S51','Non-Inverter','2',2,24000,2350,10.212765957446809,19650,2840,6.919014084507042,8.52,'Split_Wall_Mounted LG 2TR SEER 8.52','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','General','ASSA24FMTA','Non-Inverter','2',1.88,22600,1960,11.530612244897959,19500,2350,8.2978723404255312,9.82,'Split_Wall_Mounted General 1.88TR SEER 9.82','Split_Wall_Mounted LG 1.99TR SEER 9.80'),
('Split_Wall_Mounted','Carrier','38XPL036H3','Non-Inverter','2.5',2.62,31500,2640,11.931818181818182,28000,3190,8.7774294670846391,10.24,'Split_Wall_Mounted Carrier 2.62TR SEER 10.24','Split_Wall_Mounted Carrier 2.58TR SEER 10.41'),
('Split_Wall_Mounted','LG','S242KC st2','Non-Inverter','2',2,24000,2350,10.212765957446809,19722,2700,7.3044444444444441,8.65,'Split_Wall_Mounted LG 2TR SEER 8.65','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','LG','LS-K2422CL','Non-Inverter','2',2,24000,2100,11.428571428571429,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','PlasmaGold','LS-C242TGM0','Non-Inverter','2',2,24000,2350,10.212765957446809,19722.18,2700,7.3045111111111112,8.65,'Split_Wall_Mounted PlasmaGold 2TR SEER 8.65','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','LG','T2421C nc0','Non-Inverter','2',2,24000,2500,9.6,19312,2840,6.8,8.1,'Split_Wall_Mounted LG 2TR SEER 8.1','Split_Wall_Mounted Zamil 2.12TR SEER 8.09'),
('Split_Wall_Mounted','Midea','MSTEP24CRNF6','Non-Inverter','2',1.75,21000,1770,11.864406779661017,18200,2130,8.544600938967136,10.11,'Split_Wall_Mounted Midea 1.75TR SEER 10.11','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','York','YHFE24XT3CFE-R4','Non-Inverter','2',1.83,22000,1775,12.394366197183098,19000,2200,8.6363636363636367,10.459999999999999,'Split_Wall_Mounted York 1.83TR SEER 10.46','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','B2424H N51','Inverter','2',1.75,21951,1820,12.060989010989012,18937,2280,8.3057017543859644,10.14,'Split_Wall_Mounted LG 1.75TR SEER 10.14','Inverter unit "No replacement"'),
('Split_Wall_Mounted','LG','S242NC  N52','Non-Inverter','2',1.83,22000,2500,8.8000000000000007,19100,3000,6.3666666666666663,7.51,'Split_Wall_Mounted LG 1.83TR SEER 7.51','Split_Wall_Mounted Zamil 1.83TR SEER 7.51'),
('Split_Wall_Mounted','LG','GG24KCN','Non-Inverter','2',1.75,21000,1770,11.864406779661017,18200,2130,8.544600938967136,10.11,'Split_Wall_Mounted LG 1.75TR SEER 10.11','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','Carrier','42QHA012HSN','Non-Inverter','1',0.96,11600,979,11.848825331971399,10100,1188,8.5016835016835017,10.09,'Split_Wall_Mounted Carrier 0.96TR SEER 10.09','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','ZTRUST','TZS30C0','Non-Inverter','2',2.29,27500,2270,12.114537444933921,24200,2795,8.658318425760287,10.31,'Split_Wall_Mounted ZTRUST 2.29TR SEER 10.31','Split_Wall_Mounted Zamil 2.24TR SEER 10.35'),
('Split_Wall_Mounted','Samsung','AR18JRF3BWKN','Non-Inverter','1.5',1.5,18000,1540,11.688311688311689,15500,1850,8.378378378378379,9.94,'Split_Wall_Mounted Samsung 1.5TR SEER 9.94','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','Gold_Eleteca','GO A245C-1','Non-Inverter','2',1.9,22850,1969.82,11.600044674132663,20245,2242,9.0298840321141842,10.1,'Split_Wall_Mounted Gold_Eleteca 1.9TR SEER 10.1','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','LG','B242PC n52','Non-Inverter','2',1.83,22000,1900,11.578947368421053,19000,2290,8.2969432314410483,9.85,'Split_Wall_Mounted LG 1.83TR SEER 9.85','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Noon','Nac24kdsfcm','Non-Inverter','2',1.84,22100,1804,12.250554323725055,18500,2189,8.4513476473275464,10.29,'Split_Wall_Mounted Noon 1.84TR SEER 10.29','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','Craft','DSA20FE7YHA1','Non-Inverter','1.5',1.48,17800,1460,12.191780821917808,15400,1820,8.4615384615384617,10.28,'Split_Wall_Mounted Craft 1.48TR SEER 10.28','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','York','YQFE30YH3CHQO-5','Non-Inverter','2',2.2799999999999998,27400,2238,12.243074173369079,23200,2682,8.6502609992542876,10.36,'Split_Wall_Mounted York 2.28TR SEER 10.36','Split_Wall_Mounted Zamil 2.24TR SEER 10.35'),
('Split_Wall_Mounted','LG','Y242NCn54','Non-Inverter','2',1.75,20991,2200,9.541363636363636,18251,2600,7.0196153846153848,8.18,'Split_Wall_Mounted LG 1.75TR SEER 8.18','Split_Wall_Mounted LG 1.74TR SEER 8.17'),
('Split_Wall_Mounted','York','HTEA24 OSADR','Non-Inverter','2',2,24000,2650,9.0566037735849054,null,null,null,null,null,'Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','General','Assa24futa','Non-Inverter','2',2,24000,2000,12,20500,2350,8.7234042553191493,10.23,'Split_Wall_Mounted General 2TR SEER 10.23','Split_Wall_Mounted LG 1.83TR SEER 10.27'),
('Split_Wall_Mounted','LG','B1824C n51','Non-Inverter','1.5',1.45,17500,1520,11.513157894736842,15000,1820,8.2417582417582409,9.7799999999999994,'Split_Wall_Mounted LG 1.45TR SEER 9.78','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','ARROW','RO-24SHH','Non-Inverter','2',1.83,22000,1810,12.154696132596685,19000,2222,8.5508550855085517,10.28,'Split_Wall_Mounted ARROW 1.83TR SEER 10.28','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','Unistar','UNST 30CCG','Non-Inverter','2',2.04,24566,2100,11.698095238095238,21154,2500,8.4616000000000007,9.9700000000000006,'Split_Wall_Mounted Unistar 2.04TR SEER 9.97','Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','IPX4','AXO18CV6ROWPK','Non-Inverter','1.5',1.41,17000,1472,11.548913043478262,14500,1747,8.2999427590154546,9.82,'Split_Wall_Mounted IPX4 1.41TR SEER 9.82','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','Zamil','KZC18CSAHIV','Non-Inverter','1.5',1.42,17049,1790,9.524581005586592,14497,2071,7,8.15,'Split_Wall_Mounted Zamil 1.42TR SEER 8.15','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','Classic','KXC24CSSHIV','Non-Inverter','2',1.95,23493,2460,9.5500000000000007,20104,2935,6.8497444633730833,8.1199999999999992,'Split_Wall_Mounted Classic 1.95TR SEER 8.12','Split_Wall_Mounted Zamil 1.95TR SEER 8.11'),
('Split_Wall_Mounted','Mando','AC-18C-MP','Non-Inverter','1.5',1.53,18400,1560,11.794871794871796,16600,1860,8.9247311827956981,10.209999999999999,'Split_Wall_Mounted Mando 1.53TR SEER 10.21','Split_Wall_Mounted Ugine 1.48TR SEER 10.23'),
('Split_Wall_Mounted','LG','S382GH','Non-Inverter','2.5',2.6,31236,3800,8.2200000000000006,27472,4220,6.5099526066350712,7.1899999999999995,'Split_Wall_Mounted LG 2.6TR SEER 7.19','Split_Wall_Mounted LG 2.6TR SEER 7.18'),
('Split_Wall_Mounted','LG','S242HQ','Non-Inverter','2',2,24000,2600,9.2307692307692299,19654,2840,6.9204225352112676,7.91,'Split_Wall_Mounted LG 2TR SEER 7.91','Split_Wall_Mounted Carrier 1.81TR SEER 7.91'),
('Split_Wall_Mounted','ARROW','AX18C','Non-Inverter','1.5',1.5,18000,1920,9.375,16600,2350,7.0638297872340425,8.129999999999999,'Split_Wall_Mounted ARROW 1.5TR SEER 8.13','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','Craft','DSW36FE7HY7M','Non-Inverter','3',2.97,35712,2951,12.101660454083362,null,null,null,null,null,'Split_Wall_Mounted Carrier 2.75TR SEER 8.81'),
('Split_Wall_Mounted','Craft','DS30FE7HY7WM','Non-Inverter','2.5',2.34,28118,2342,12.005977796754911,23871,2791,8.5528484414188455,10.18,'Split_Wall_Mounted Craft 2.34TR SEER 10.18','Split_Wall_Mounted Carrier 2.25TR SEER 10.20'),
('Split_Wall_Mounted','LG','X182SH','Non-Inverter','1.5',1.52,18255,1900,9.6078947368421055,15184,2200,6.9018181818181814,8.15,'Split_Wall_Mounted LG 1.52TR SEER 8.15','Split_Wall_Mounted LG 1.52TR SEER 8.15'),
('Split_Wall_Mounted','Craft','DS24FE7H5Y','Non-Inverter','2',1.86,22400,2330,9.6137339055793998,20002,2700,7.4081481481481477,8.36,'Split_Wall_Mounted Craft 1.86TR SEER 8.36','Split_Wall_Mounted Carrier 1.79TR SEER 8.31'),
('Split_Wall_Mounted','LG','NT382H2','Inverter','2.5',2.5,30000,2440,12.295081967213115,25400,2885,8.8041594454072793,10.44,'Split_Wall_Mounted LG 2.5TR SEER 10.44','Split_Wall_Mounted LG 2.5TR SEER 10.43'),
('Split_Wall_Mounted','General','GC-30KFC','Non-Inverter','2',2.23,26800,2161,12.401665895418787,null,null,null,null,null,'Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','Craft','DS18CE7H5YHS','Non-Inverter','1.5',1.64,19752,2003,9.8612081877184217,17289,2301,7.513689700130378,8.5299999999999994,'Split_Wall_Mounted Craft 1.64TR SEER 8.53','Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','Zamil','KZC24CSGHIV','Non-Inverter','2',1.83,22001,2303,9.5531914893617014,18801,2686,6.9996276991809383,8.17,'Split_Wall_Mounted Zamil 1.83TR SEER 8.17','Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','Zamil','ACSU24','Non-Inverter','2',1.91,23000,2770,8.3032490974729249,null,null,null,null,null,'Split_Wall_Mounted Carrier 1.79TR SEER 8.31'),
('Split_Wall_Mounted','Fuji','FJS18CHR','Non-Inverter','1.5',1.38,16675,1450,11.5,14362,1670,8.6,9.89,'Split_Wall_Mounted Fuji 1.38TR SEER 9.89','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','Mando','MP-12CDN','Non-Inverter','1',1,12000,968,12.396694214876034,10400,1195,8.7029288702928866,10.48,'Split_Wall_Mounted Mando 1TR SEER 10.48','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Floor_Standing','Daewoo','DPA-380RH / 300RH','Non-Inverter','3',3.16,38000,4000,9.5,31500,4500,7,8.11,'Split_Floor_Standing Daewoo 3.16TR SEER 8.11','Split_Floor_Standing Daewoo 3.16TR SEER 8.11'),
('Split_Floor_Standing','LG','LPNC452TM5','Non-Inverter','3',3.33,39988.626670457779,4200,9.5211015882042336,34017.628660790448,4970,6.8445932919095469,8.09,'Split_Floor_Standing LG 3.33TR SEER 8.09','Split_Floor_Standing LG 3.33TR SEER 8.08'),
('Split_Floor_Standing','Zamil','DFX48ESCNASQ','Non-Inverter','3.5',3.41,40988.342337219226,5125,7.9977253340915562,34491.896502701165,5725,6.0247854153189806,6.88,'Split_Floor_Standing Zamil 3.41TR SEER 6.88','Split_Floor_Standing Zamil 3.42TR SEER 6.87'),
('Split_Floor_Standing','Zamil','GFX48MTHNIV','Non-Inverter','3.5',3.5,42000,4380,9.5890410958904102,37530,5000,7.5060000000000002,8.3699999999999992,'Split_Floor_Standing Zamil 3.5TR SEER 8.37','Split_Floor_Standing Zamil 3.5TR SEER 8.37'),
('Split_Floor_Standing','Carrier','42SD6B.38HK48','Non-Inverter','3.5',3.54,42500,4336.7346938775509,9.8000000000000007,37000,4836.6013071895422,7.65,8.5299999999999994,'Split_Floor_Standing Carrier 3.54TR SEER 8.53','Split_Floor_Standing Carrier 3.54TR SEER 8.52'),
('Split_Floor_Standing','LG','APNQ50GT2E0','Non-Inverter','4',3.84,46096.104634631789,4000,11.524026158657946,39988.626670457779,4750,8.4186582464121642,9.85,'Split_Floor_Standing LG 3.84TR SEER 9.85','Split_Floor_Standing LG 4TR SEER 10.51'),
('Split_Floor_Standing','Samsung','AF55JV1MAEEX/ AF55JV1MAEEN','Inverter','4',4,48000,3930,12.213740458015268,42000,4950,8.4848484848484844,null,'Split_Floor_Standing Samsung 4TR SEER Inverter','Inverter unit "No replacement"'),
('Split_Floor_Standing','LG','APNQ55GT3M4','Inverter','4',4,48000,3870,12.403100775193799,43000,4940,8.7044534412955468,10.52,'Split_Floor_Standing LG 4TR SEER 10.52','Inverter unit "No replacement"'),
('Split_Floor_Standing','LG','LPNC552TM4/TE3','Non-Inverter','4',4,48109,5200,9.25173076923077,42308,6150,6.8793495934959346,7.96,'Split_Floor_Standing LG 4TR SEER 7.96','Split_Floor_Standing LG 4.01TR SEER 7.95'),
('Split_Floor_Standing','LG','LPNC552T1M5/E5','Non-Inverter','4',4,48109.183963605348,4750,10.128249255495863,42308.785897071371,5700,7.4225940170300655,8.68,'Split_Floor_Standing LG 4TR SEER 8.68','Split_Floor_Standing LG 4.01TR SEER 8.67'),
('Split_Floor_Standing','LG','LPNH552T1M5','Non-Inverter','4',4,48109.183963605348,4750,10.128249255495863,42308.785897071371,5700,7.4225940170300655,8.68,'Split_Floor_Standing LG 4TR SEER 8.68','Split_Floor_Standing LG 4.01TR SEER 8.67'),
('Split_Floor_Standing','Samsung','APH553QF','Non-Inverter','4',4.16,49967.441999999995,5200,9.6091234615384611,49967.441999999995,5900,8.469057966101694,8.74,'Split_Floor_Standing Samsung 4.16TR SEER 8.74','Split_Floor_Standing LG 3.84TR SEER 9.84'),
('Split_Floor_Standing','LG','LP-H652ME0','Non-Inverter','4',4.3499999999999996,52203.582598805806,6190,8.4335351532804204,42991.185669604776,7440,5.7783851706458034,7.06,'Split_Floor_Standing LG 4.35TR SEER 7.06','Split_Floor_Standing LG 4.35TR SEER 7.05'),
('Split_Floor_Standing','Zamil','MFZ60CSCDADC','Non-Inverter','4',4.42,53056.582314472565,4416,12.014624618313533,45997.15666761445,5476,8.3997729487973789,10.15,'Split_Floor_Standing Zamil 4.42TR SEER 10.15','Split_Floor_Standing Zamil 4.421TR SEER 10.15'),
('Split_Floor_Standing','LG','LV-H602LLA3','Non-Inverter','4',4.49,53909.582030139332,5600,9.6267110768105955,47426.784191071943,6600,7.1858763925866578,8.2899999999999991,'Split_Floor_Standing LG 4.49TR SEER 8.29','Split_Floor_Standing LG 4.49TR SEER 8.28'),
('Split_Floor_Standing','LG','ABUQ60LM3T0 / ABUQ54LM3T0','Non-Inverter','4',4.5,54000,4610,11.713665943600867,45600,5300,8.6037735849056602,10.01,'Split_Floor_Standing LG 4.5TR SEER 10.01','Split_Floor_Standing LG 4.5TR SEER 10.00'),
('Split_Floor_Standing','LG','APNW50GT1M0KR0','Non-Inverter','4',3.84,46188.034188034195,4000,11.547008547008549,39990,4750,8.418947368421053,9.8699999999999992,'Split_Floor_Standing LG 3.84TR SEER 9.87','Split_Floor_Standing LG 3.84TR SEER 9.84'),
('Split_Floor_Standing','LG','APNQ55GT3M6','Inverter','4',4,48000,3870,12.403100775193799,43000,4940,8.7044534412955468,10.52,'Split_Floor_Standing LG 4TR SEER 10.52','Inverter unit "No replacement"'),
('Split_Floor_Standing','LG','LPNC552TE3','Non-Inverter','4',4,48111,5200,9.2521153846153847,42310,6150,6.8796747967479677,7.96,'Split_Floor_Standing LG 4TR SEER 7.96','Split_Floor_Standing LG 4.01TR SEER 7.95'),
('Split_Floor_Standing','Gree','GVH48AH-D3NTA5A/I','Non-Inverter','3.5',3.62,43500,3645,11.934156378600823,38200,4495,8.4983314794215801,10.14,'Split_Floor_Standing Gree 3.62TR SEER 10.14','Split_Floor_Standing Gree 3.62TR SEER 10.14'),
('Split_Floor_Standing','Haam','HM48CFSA21-I','Non-Inverter','3.5',3.58,43000,3613,11.90146692499308,38000,4524,8.3996463306808131,10.1,'Split_Floor_Standing Haam 3.58TR SEER 10.1','Split_Floor_Standing Zamil 3.83TR SEER 10.37'),
('Split_Floor_Standing','General','GT48CH','Non-Inverter','3.5',3.61,43400,3480,12.471264367816092,37400,4210,8.8836104513064136,10.59,'Split_Floor_Standing General 3.61TR SEER 10.59','Split_Floor_Standing Zamil 3.83TR SEER 10.37'),
('Split_Floor_Standing','LG','LPNC552TE2','Non-Inverter','4',4.01,48205.128205128203,5200,9.2702169625246551,42310,6150,6.8796747967479677,7.97,'Split_Floor_Standing LG 4.01TR SEER 7.97','Split_Floor_Standing LG 4.01TR SEER 7.95'),
('Split_Floor_Standing','Samsung','AF55GC1MBEEN','Non-Inverter','4',3.91,47000,4500,10.444444444444445,42000,5400,7.7777777777777777,9,'Split_Floor_Standing Samsung 3.91TR SEER 9','Split_Floor_Standing Samsung 4.16TR SEER 8.74'),
('Split_Floor_Standing','Haas','HHFS50FE6','Non-Inverter','4',3.86,46400,3880,11.958762886597938,40600,4740,8.5654008438818572,10.18,'Split_Floor_Standing Haas 3.86TR SEER 10.18','Split_Floor_Standing Gree 3.62TR SEER 10.14'),
('Split_Floor_Standing','Haas','HHFS50FE7','Non-Inverter','3.5',3.75,45000,3780,11.904761904761905,38560,4550,8.4747252747252748,10.1,'Split_Floor_Standing Haas 3.75TR SEER 10.1','Split_Floor_Standing Gree 3.62TR SEER 10.14'),
('Split_Floor_Standing','LG','LPNH552T1E5','Non-Inverter','4',4,48111,4750,10.128631578947369,42310,5700,7.4228070175438594,8.68,'Split_Floor_Standing LG 4TR SEER 8.68','Split_Floor_Standing LG 4.01TR SEER 8.67'),
('Split_Floor_Standing','Carrier','38SDL6B','Non-Inverter','4',4,48000,4100,11.707317073170731,41500,4950,8.3838383838383841,9.9499999999999993,'Split_Floor_Standing Carrier 4TR SEER 9.95','Split_Floor_Standing Carrier 4TR SEER 9.95'),
('Split_Floor_Standing','Mando','AC-FS-48000C','Non-Inverter','4',3.85,46200,3970,11.637279596977329,41000,4920,8.3333333333333339,9.91,'Split_Floor_Standing Mando 3.85TR SEER 9.91','Split_Floor_Standing LG 4TR SEER 10.51'),
('Split_Floor_Standing','Gree','GVC60AH-H3NTA5A/I','Non-Inverter','4',4.25,51000,4360,11.697247706422019,43600,5130,8.4990253411306043,9.98,'Split_Floor_Standing Gree 4.25TR SEER 9.98','Split_Floor_Standing Carrier 4TR SEER 9.95'),
('Split_Floor_Standing','Midea','MFTGA50HRN','Non-Inverter','4',3.87,46454,3759,12.35807395583932,40818,4710,8.666242038216561,10.459999999999999,'Split_Floor_Standing Midea 3.87TR SEER 10.46','Split_Floor_Standing LG 4TR SEER 10.51'),
('Split_Floor_Standing','Mitsubishi','PSH-6GJS','Non-Inverter','4',4.32,51900,6250,8.3040000000000003,45700,7420,6.1590296495956878,7.14,'Split_Floor_Standing Mitsubishi 4.32TR SEER 7.14','Split_Floor_Standing LG 4.35TR SEER 7.05'),
('Split_Floor_Standing','LG','LPNC559T1M5','Non-Inverter','4',4,48101,4760,10.105252100840335,42305,5750,7.3573913043478258,8.64,'Split_Floor_Standing LG 4TR SEER 8.64','Split_Floor_Standing LG 4.01TR SEER 8.67'),
('Split_Floor_Standing','Classic','MFX48CSHNAD','Non-Inverter','4',3.8,45600,3800,12,40600,4693,8.651182612401449,10.25,'Split_Floor_Standing Classic 3.8TR SEER 10.25','Split_Floor_Standing LG 4TR SEER 10.51'),
('Split_Floor_Standing','LG','LPNC552T1M5','Non-Inverter','4',4,48111.2022,4750,10.128674147368422,42310.560799999999,5700,7.4229054035087714,8.68,'Split_Floor_Standing LG 4TR SEER 8.68','Split_Floor_Standing LG 4.01TR SEER 8.67'),
('Split_Floor_Standing','Samsung','AP55Q1CN','Non-Inverter','4',4.16,50000,5500,9.0909090909090917,44000,6250,7.04,7.8999999999999995,'Split_Floor_Standing Samsung 4.16TR SEER 7.9','Split_Floor_Standing Samsung 4.16TR SEER 8.74'),
('Split_Floor_Standing','Haam','HM48CFSA20','Non-Inverter','3.5',3.58,43000,3629,11.848994213281896,38000,4524,8.3996463306808131,10.06,'Split_Floor_Standing Haam 3.58TR SEER 10.06','Split_Floor_Standing Gree 3.62TR SEER 10.14'),
('Split_Floor_Standing','LG','APNQ55GT3MT6','Inverter','4',4,48000,3870,12.403100775193799,43000,4940,8.7044534412955468,10.52,'Split_Floor_Standing LG 4TR SEER 10.52','Inverter unit "No replacement"'),
('Split_Floor_Standing','LG','APNQ50GT2MEO','Non-Inverter','4',3.84,46153.846153846156,4000,11.538461538461538,40000,4750,8.4210526315789469,9.86,'Split_Floor_Standing LG 3.84TR SEER 9.86','Split_Floor_Standing LG 3.84TR SEER 9.84'),
('Split_Floor_Standing','LG','APNQ55GT3M','Non-Inverter','4',4,48000,3900,12.307692307692308,45000,5170,8.7040618955512574,10.5,'Split_Floor_Standing LG 4TR SEER 10.5','Split_Floor_Standing LG 4TR SEER 10.51'),
('Split_Floor_Standing','Haas','HHFS150FE6','Non-Inverter','4',3.83,46000,3739,12.302754747258625,38000,4510,8.4257206208425721,10.299999999999999,'Split_Floor_Standing Haas 3.83TR SEER 10.3','Split_Floor_Standing Samsung 4TR SEER 10.3'),
('Split_Floor_Standing','Midea','MFTGA50CRN2','Non-Inverter','4',3.85,46200,3970,11.637279596977329,41000,4920,8.3333333333333339,9.91,'Split_Floor_Standing Midea 3.85TR SEER 9.91','Split_Floor_Standing Carrier 4TR SEER 9.95'),
('Split_Floor_Standing','LG','APNQ55GT3MO','Non-Inverter','4',4,48000,3900,12.307692307692308,45000,5170,8.7040618955512574,10.5,'Split_Floor_Standing LG 4TR SEER 10.5','Split_Floor_Standing LG 4TR SEER 10.51'),
('Split_Floor_Standing','Samsung','AP55Q0CN','Non-Inverter','4',4.33,52000,5400,9.6296296296296298,45000,6400,7.03125,8.23,'Split_Floor_Standing Samsung 4.33TR SEER 8.23','Split_Floor_Standing LG 4.49TR SEER 8.28'),
('Split_Floor_Standing','LG','LPNC55BTM4','Non-Inverter','4',4,48000,5400,8.8888888888888893,42310,6350,6.6629921259842524,7.66,'Split_Floor_Standing LG 4TR SEER 7.66','Split_Floor_Standing LG 3.72TR SEER 7.65'),
('Split_Floor_Standing','Zamil','MFX48CSHDAD','Non-Inverter','4',3.83,46000,3833,12.001043569006001,40800,4857,8.4002470660901789,10.16,'Split_Floor_Standing Zamil 3.83TR SEER 10.16','Split_Floor_Standing Zamil 3.83TR SEER 10.37'),
('Split_Floor_Standing','LG','LPUC55BTM4','Non-Inverter','4',4,48069,5400,8.9016666666666673,42273,6350,6.6571653543307088,7.67,'Split_Floor_Standing LG 4TR SEER 7.67','Split_Floor_Standing LG 3.72TR SEER 7.65'),
('Split_Floor_Standing','Ugine','UAFSG48H','Non-Inverter','3.5',3.73,44800,3680,12.173913043478262,39000,4525,8.6187845303867405,10.32,'Split_Floor_Standing Ugine 3.73TR SEER 10.32','Split_Floor_Standing Samsung 4TR SEER 10.3'),
('Split_Floor_Standing','LG','APUQ55GT3M0','Non-Inverter','4',4,48000,3900,12.307692307692308,45000,5170,8.7040618955512574,10.5,'Split_Floor_Standing LG 4TR SEER 10.5','Split_Floor_Standing LG 4TR SEER 10.51'),
('Split_Floor_Standing','Daewoo','DPA-380RH','Non-Inverter','3',3.16,38000,4000,9.5,31500,4500,7,8.11,'Split_Floor_Standing Daewoo 3.16TR SEER 8.11','Split_Floor_Standing Daewoo 3.16TR SEER 8.11'),
('Split_Floor_Standing','Mando','AC-FS-60000C','Non-Inverter','4',4.3499999999999996,52200,4410,11.836734693877551,45500,5470,8.3180987202925039,10.02,'Split_Floor_Standing Mando 4.35TR SEER 10.02','Split_Floor_Standing LG 4TR SEER 10.51'),
('Split_Floor_Standing','Carrier','38HFL7B1A','Non-Inverter','5',4.66,56000,4590,12.200435729847495,50000,5556,8.9992800575953922,10.48,'Split_Floor_Standing Carrier 4.66TR SEER 10.48','Split_Floor_Standing Zamil 4.421TR SEER 10.15'),
('Split_Floor_Standing','Carrier','42HFL7B1A','Non-Inverter','5',4.66,56000,4628,12.100259291270527,50000,5556,8.9992800575953922,10.42,'Split_Floor_Standing Carrier 4.66TR SEER 10.42','Split_Floor_Standing Zamil 4.421TR SEER 10.15'),
('Split_Floor_Standing','York','YLFE60BZH3CMSR5','Non-Inverter','4',4.25,51000,4113,12.399708242159008,43000,5000,8.6,10.43,'Split_Floor_Standing York 4.25TR SEER 10.43','Split_Floor_Standing LG 4TR SEER 10.51'),
('Split_Floor_Standing','York','YE8SD55SSCAC41-FT / YE8FT55SC7AC41','Non-Inverter','4',4.25,51000,4322,11.800092549745488,45000,5322,8.4554678692220975,10.049999999999999,'Split_Floor_Standing York 4.25TR SEER 10.05','Split_Floor_Standing LG 4.5TR SEER 10.00'),
('Split_Floor_Standing','LG','LP-E50B1CL','Non-Inverter','4',4.16,50000,5050,9.9009900990099009,null,null,null,null,null,'Split_Floor_Standing Carrier 4TR SEER 9.95'),
('Split_Floor_Standing','Samsung','AP55Q1DN','Non-Inverter','4',4.33,52000,5400,9.6296296296296298,null,null,null,null,null,'Split_Floor_Standing Carrier 4TR SEER 9.95'),
('Split_Floor_Standing','Samsung','AP55M0ANUMG','Non-Inverter','4',4.16,50000,5235,9.5510983763132753,null,null,null,null,null,'Split_Floor_Standing LG 3.84TR SEER 9.84'),
('Split_Floor_Standing','Zamil','MFZ48CSHDAD','Non-Inverter','4',3.83,45995,3740,12.29812834224599,41000,4824,8.4991708126036478,10.379999999999999,'Split_Floor_Standing Zamil 3.83TR SEER 10.38','Split_Floor_Standing LG 4TR SEER 10.51'),
('Split_Floor_Standing','LG','LPNH552TM4','Non-Inverter','4',3.76,45128.205128205125,5150,8.7627582773213835,38898,6100,6.3767213114754098,7.4799999999999995,'Split_Floor_Standing LG 3.76TR SEER 7.48','Split_Floor_Standing LG 3.75TR SEER 7.47'),
('Split_Floor_Standing','Carrier','42SDL6B','Non-Inverter','4',4,48000,4152,11.560693641618498,null,null,null,null,null,'Split_Floor_Standing LG 4TR SEER 10.51'),
('Split_Floor_Standing','Kelvinator','EQ060SHAA','Non-Inverter','4',4.45,53450,5626,9.5005332385353718,47571,6923,6.8714430160335116,8.1199999999999992,'Split_Floor_Standing Kelvinator 4.45TR SEER 8.12','Split_Floor_Standing LG 4.01TR SEER 7.95'),
('Split_Floor_Standing','Haam','FS-050C/hr','Non-Inverter','4',4.16,50000,5930,8.4317032040472171,null,null,null,null,null,'Split_Floor_Standing LG 4.49TR SEER 8.28'),
('Split_Floor_Standing','LG','APNQ50GT1M0','Non-Inverter','4',3.84,46098.038419999997,4000,11.524509604999999,39990.304239999998,4760,8.4013244201680664,9.85,'Split_Floor_Standing LG 3.84TR SEER 9.85','Split_Floor_Standing LG 3.84TR SEER 9.84'),
('Split_Floor_Standing','Kelvinator','KEQB60SHAC2N','Non-Inverter','4',4.5,54000,4681,11.535996581926939,null,null,null,null,null,'Split_Floor_Standing Zamil 4.421TR SEER 10.15'),
('Split_Floor_Standing','LG','APNQ55GT3M2','Inverter','4',4,48000,3870,12.403100775193799,43000,4940,8.7044534412955468,10.52,'Split_Floor_Standing LG 4TR SEER 10.52','Inverter unit "No replacement"'),
('Split_Floor_Standing','Carrier','42HD6B38HKC48','Non-Inverter','3.5',3.66,44000,4900,8.9795918367346932,null,null,null,null,null,'Split_Floor_Standing LG 4.01TR SEER 8.67'),
('Split_Floor_Standing','Gree','GVH48AL-D3DTC7A/I','Non-Inverter','3.5',3.73,44800,3688,12.147505422993492,null,null,null,null,null,'Split_Floor_Standing LG 4TR SEER 10.51'),
('Split_Floor_Standing','LG','LP-C55BTM2','Non-Inverter','5',4.58,55000,5050,10.891089108910892,null,null,null,null,null,'Split_Floor_Standing Zamil 4.421TR SEER 10.15'),
('Split_Floor_Standing','Gree','GVH48AH-D3NTA5A/O','Non-Inverter','3.5',3.62,43500,3645,11.934156378600823,38200,4495,8.4983314794215801,10.14,'Split_Floor_Standing Gree 3.62TR SEER 10.14','Split_Floor_Standing Gree 3.62TR SEER 10.14'),
('Split_Floor_Standing','LG','LPNC552TM4','Non-Inverter','3.5',3.72,44699,5200,8.5959615384615393,42310,6150,6.8796747967479677,7.59,'Split_Floor_Standing LG 3.72TR SEER 7.59','Split_Floor_Standing Samsung 4TR SEER 10.3')
on conflict (equipment_type, model_no) do update set
  make = excluded.make,
  compressor_type = excluded.compressor_type,
  size_category = excluded.size_category,
  tr = excluded.tr,
  t1_btu = excluded.t1_btu,
  t1_w = excluded.t1_w,
  t1_eer = excluded.t1_eer,
  t3_btu = excluded.t3_btu,
  t3_w = excluded.t3_w,
  t3_eer = excluded.t3_eer,
  equivalent_seer = excluded.equivalent_seer,
  surveyed_unit_description = excluded.surveyed_unit_description,
  equivalent_ac_model_description = excluded.equivalent_ac_model_description
where (t.make, t.compressor_type, t.size_category, t.tr, t.t1_btu, t.t1_w, t.t1_eer, t.t3_btu, t.t3_w, t.t3_eer, t.equivalent_seer, t.surveyed_unit_description, t.equivalent_ac_model_description)
   is distinct from (excluded.make, excluded.compressor_type, excluded.size_category, excluded.tr, excluded.t1_btu, excluded.t1_w, excluded.t1_eer, excluded.t3_btu, excluded.t3_w, excluded.t3_eer, excluded.equivalent_seer, excluded.surveyed_unit_description, excluded.equivalent_ac_model_description);

-- >>> CHUNK 5/11 — old_model_registry rows 801-1000 of 1516
insert into public.old_model_registry as t (equipment_type, make, model_no, compressor_type, size_category, tr, t1_btu, t1_w, t1_eer, t3_btu, t3_w, t3_eer, equivalent_seer, surveyed_unit_description, equivalent_ac_model_description) values
('Split_Floor_Standing','Carrier','38HD48-3-CT','Non-Inverter','4',4,48000,4152,11.560693641618498,null,null,null,null,null,'Split_Floor_Standing LG 4TR SEER 10.51'),
('Split_Ceiling_Ducted','LG','LBNC422GSA4','Non-Inverter','3.5',3.37,40500.426499857829,5050,8.0198864356154118,36508.387830537387,5750,6.3492848400934587,7.0299999999999994,'Split_Ceiling_Ducted LG 3.37TR SEER 7.03','Split_Ceiling_Ducted LG 3.37TR SEER 7.02'),
('Split_Ceiling_Ducted','Zamil','KYA060H/DYA60H','Non-Inverter','4',4.41,53000,4600,11.521739130434783,47200,5690,8.2952548330404223,9.83,'Split_Ceiling_Ducted Zamil 4.41TR SEER 9.83','Split_Ceiling_Ducted Zamil 4.41TR SEER 9.83'),
('Split_Ceiling_Ducted','Carrier','38MKS60US30-01','Non-Inverter','4',4.45,53500,5490,9.7449908925318756,47000,6710,7.0044709388971684,8.31,'Split_Ceiling_Ducted Carrier 4.45TR SEER 8.31','Split_Ceiling_Ducted Carrier 4.45TR SEER 8.30'),
('Split_Ceiling_Ducted','LG','LBNC602RSA4','Non-Inverter','5',4.8600000000000003,58345.180551606492,6350,9.1882174097018101,51214.102928632354,7500,6.8285470571509803,7.8999999999999995,'Split_Ceiling_Ducted LG 4.86TR SEER 7.9','Split_Ceiling_Ducted LG 4.86TR SEER 7.90'),
('Split_Ceiling_Ducted','York','YE3SD18OSHBW22-VH','Non-Inverter','1.5',1.5,18000,2390,7.531380753138075,15480,2850,5.4315789473684211,6.42,'Split_Ceiling_Ducted York 1.5TR SEER 6.42','Split_Ceiling_Ducted YORK 1.5TR SEER 6.41'),
('Split_Ceiling_Ducted','York','YE3SD48SECAC22-H','Non-Inverter','4',4,48000,6380,7.523510971786834,41280,5570,7.4111310592459603,6.91,'Split_Ceiling_Ducted York 4TR SEER 6.91','Split_Ceiling_Ducted YORK 4TR SEER 6.90'),
('Split_Ceiling_Ducted','York','YE3SD30RSHAC22-H','Non-Inverter','2.5',2.5,30000,3990,7.518796992481203,25800,4750,5.4315789473684211,6.41,'Split_Ceiling_Ducted York 2.5TR SEER 6.41','Split_Ceiling_Ducted YORK 2.5TR SEER 6.40'),
('Split_Ceiling_Ducted','York','YE3SD36RSHAD22-2','Non-Inverter','3',3,36000,4790,7.515657620041754,30960,4750,6.5178947368421056,6.71,'Split_Ceiling_Ducted York 3TR SEER 6.71','Split_Ceiling_Ducted YORK 3TR SEER 6.70'),
('Split_Ceiling_Ducted','York','YE3SD60SECBK22-H','Non-Inverter','5',5,60000,7980,7.518796992481203,51600,9540,5.4088050314465406,6.3999999999999995,'Split_Ceiling_Ducted York 5TR SEER 6.4','Split_Ceiling_Ducted YORK 5TR SEER 6.39'),
('Split_Ceiling_Cassette','Carrier','42KTD018HS','Non-Inverter','1.5',1.33,16000,1330,12.030075187969924,15000,1610,9.316770186335404,10.52,'Split_Ceiling_Cassette Carrier 1.33TR SEER 10.52','Split_Ceiling_Cassette Carrier 1.33TR SEER 10.51'),
('Split_Ceiling_Cassette','LG','LT-C182ELE0','Non-Inverter','1.5',1.5,18000,1970,9.1370558375634516,16002.274665908448,2150,7.4429184492597429,8.0499999999999989,'Split_Ceiling_Cassette LG 1.5TR SEER 8.05','Split_Ceiling_Cassette LG 1.5TR SEER 8.05'),
('Split_Ceiling_Cassette','Mitsubishi','FDTN257HEPA','Non-Inverter','2',1.76,21154.392948535686,2680,7.8934302046774949,17742.39408586864,3050,5.8171783888093902,6.75,'Split_Ceiling_Cassette Mitsubishi 1.76TR SEER 6.75','Split_Ceiling_Cassette Mitsubishi 1.76TR SEER 6.74'),
('Split_Ceiling_Cassette','LG','ATNQ24GPLT2','Inverter','2',1.83,22000,1770,12.429378531073446,20000,2260,8.8495575221238933,10.59,'Split_Ceiling_Cassette LG 1.83TR SEER 10.59','Inverter unit "No replacement"'),
('Split_Ceiling_Cassette','Zamil','SCZ24CHAXCD1','Non-Inverter','2',1.94,23300,1900,12.263157894736842,19800,2300,8.6086956521739122,10.36,'Split_Ceiling_Cassette Zamil 1.94TR SEER 10.36','Split_Ceiling_Cassette Zamil 1.94TR SEER 10.35'),
('Split_Ceiling_Cassette','Carrier','42KTD024HS','Non-Inverter','2',1.95,23500,1950,12.051282051282051,20000,2300,8.695652173913043,10.25,'Split_Ceiling_Cassette Carrier 1.95TR SEER 10.25','Split_Ceiling_Cassette Carrier 1.96TR SEER 10.25'),
('Split_Ceiling_Cassette','Carrier','42QTD024HSN','Non-Inverter','2',1.96,23600,1927,12.247016087182148,20000,2300,8.695652173913043,10.37,'Split_Ceiling_Cassette Carrier 1.96TR SEER 10.37','Split_Ceiling_Cassette Carrier 1.97TR SEER 10.37'),
('Split_Ceiling_Cassette','LG','LTNC242PLE1','Non-Inverter','2',1.99,23885,2500,9.5540000000000003,21667,3050,7.1039344262295083,8.24,'Split_Ceiling_Cassette LG 1.99TR SEER 8.24','Split_Ceiling_Cassette LG 1.99TR SEER 8.23'),
('Split_Ceiling_Cassette','LG','LT-C242ELE0','Non-Inverter','2',2,24000,2500,9.6,21000,2830,7.4204946996466434,8.34,'Split_Ceiling_Cassette LG 2TR SEER 8.34','Split_Ceiling_Cassette LG 2.0TR SEER 8.33'),
('Split_Ceiling_Cassette','Mitsubishi','FDTN306CEP','Non-Inverter','2',2.0099999999999998,24225.191924936025,3030,7.9951128465135399,19448.393517202163,3260,5.9657648825773508,6.83,'Split_Ceiling_Cassette Mitsubishi 2.01TR SEER 6.83','Split_Ceiling_Cassette Mitsubishi 2.02TR SEER 6.93'),
('Split_Ceiling_Cassette','LG','LTNC302PLEO','Non-Inverter','2.5',2.31,27800,3240,8.5802469135802468,24400,3800,6.4210526315789478,7.39,'Split_Ceiling_Cassette LG 2.31TR SEER 7.39','Split_Ceiling_Cassette LG 2.32TR SEER 8.12'),
('Split_Ceiling_Cassette','LG','LTNC302NLE1','Non-Inverter','2.5',2.31,27807.790730736426,2920,9.5232160036768576,24429.911856696046,3550,6.8816653117453654,8.129999999999999,'Split_Ceiling_Cassette LG 2.31TR SEER 8.13','Split_Ceiling_Cassette LG 2.32TR SEER 8.12'),
('Split_Ceiling_Cassette','Carrier','42KTD036HS','Non-Inverter','3',2.87,34500,2950,11.694915254237289,31000,3600,8.6111111111111107,10.049999999999999,'Split_Ceiling_Cassette Carrier 2.87TR SEER 10.05','Split_Ceiling_Cassette Carrier 2.88TR SEER 10.05'),
('Split_Ceiling_Cassette','LG','ATUW48GMLT0SA0','Non-Inverter','4',3.83,45993.74466875178,3960,11.61458198705853,39067.386977537673,4660,8.3835594372398443,9.879999999999999,'Split_Ceiling_Cassette LG 3.83TR SEER 9.88','Split_Ceiling_Cassette LG 3.83TR SEER 9.87'),
('Split_Ceiling_Cassette','LG','LTUH602MLE0','Non-Inverter','4',4.21,50634.063121978965,5500,9.2061932949052672,41967.586010804669,6700,6.2638188075827861,7.7,'Split_Ceiling_Cassette LG 4.21TR SEER 7.7','Split_Ceiling_Cassette LG 4.21TR SEER 7.69'),
('Split_Ceiling_Cassette','Mando','AC-CST-48000H','Non-Inverter','3.5',3.75,45000,3850,11.688311688311689,38500,4640,8.2974137931034484,9.91,'Split_Ceiling_Cassette Mando 3.75TR SEER 9.91','Split_Ceiling_Cassette LG 3.83TR SEER 9.87'),
('Split_Ceiling_Cassette','Zamil','SCX36CHAXCD','Non-Inverter','3',2.83,34000,2800,12.142857142857142,28400,3350,8.4776119402985071,10.23,'Split_Ceiling_Cassette Zamil 2.83TR SEER 10.23','Split_Ceiling_Cassette Carrier 2.88TR SEER 10.05'),
('Split_Ceiling_Cassette','LG','LTNH482MLE0','Non-Inverter','3.5',3.74,44972,4650,9.671397849462366,39103,6740,5.801632047477745,7.8199999999999994,'Split_Ceiling_Cassette LG 3.74TR SEER 7.82','Split_Ceiling_Cassette LG 3.83TR SEER 9.87'),
('Split_Ceiling_Cassette','LG','LTUO302PIE0','Non-Inverter','2.5',2.3199999999999998,27955,3210,8.7087227414330215,24567,3800,6.4649999999999999,7.49,'Split_Ceiling_Cassette LG 2.32TR SEER 7.49','Split_Ceiling_Cassette LG 2.31TR SEER 7.39'),
('Split_Ceiling_Cassette','LG','LTUC242QLE0','Non-Inverter','2',1.76,21137,2470,8.5574898785425102,18766,2900,6.471034482758621,7.3999999999999995,'Split_Ceiling_Cassette LG 1.76TR SEER 7.4','Split_Ceiling_Cassette LG 1.83TR SEER 10.59'),
('Split_Ceiling_Cassette','LG','LTUC362NLE0','Non-Inverter','3',2.74,32995,3900,8.4602564102564095,29310,4500,6.5133333333333336,7.35,'Split_Ceiling_Cassette LG 2.74TR SEER 7.35','Split_Ceiling_Cassette Carrier 2.88TR SEER 10.05'),
('Split_Ceiling_Cassette','LG','LTUH362NLE0','Non-Inverter','3',2.74,32997.370000000003,3900,8.4608641025641038,29338,4500,6.5195555555555558,7.35,'Split_Ceiling_Cassette LG 2.74TR SEER 7.35','Split_Ceiling_Cassette Carrier 2.88TR SEER 10.05'),
('Split_Ceiling_Cassette','LG','LT-H2442EL1EO','Non-Inverter','2',2,24000,2500,9.6,20984.673299999999,2830,7.4150789045936394,8.34,'Split_Ceiling_Cassette LG 2TR SEER 8.34','Split_Ceiling_Cassette LG 2.0TR SEER 8.33'),
('Split_Ceiling_Cassette','Gree','GUD18T1/A2-S','Non-Inverter','1.5',1.51,18200,1470,12.380952380952381,16800,2000,8.4,10.42,'Split_Ceiling_Cassette Gree 1.51TR SEER 10.42','Split_Ceiling_Cassette Carrier 1.33TR SEER 10.51'),
('Split_Ceiling_Cassette','LG','LBUH602RSA4','Non-Inverter','5',4.8600000000000003,58347.628199999999,6350,9.1886028661417321,48964.237699999998,7680,6.3755517838541662,7.7299999999999995,'Split_Ceiling_Cassette LG 4.86TR SEER 7.73','Split_Ceiling_Cassette LG 4.21TR SEER 7.69'),
('Split_Ceiling_Cassette','LG','LTUC302PLE0','Non-Inverter','2.5',2.31,27801,3240,8.5805555555555557,24436,3800,6.4305263157894741,7.3999999999999995,'Split_Ceiling_Cassette LG 2.31TR SEER 7.4','Split_Ceiling_Cassette LG 2.31TR SEER 7.39'),
('Split_Ceiling_Cassette','LG','LBUH482RSA4','Non-Inverter','4',4,47992.82,5040,9.52238492063492,42517.48,6200,6.8576580645161291,8.129999999999999,'Split_Ceiling_Cassette LG 4TR SEER 8.13','Split_Ceiling_Cassette LG 4.21TR SEER 7.69'),
('Split_Ceiling_Cassette','LG','ATNW24GNLT0','Non-Inverter','2',1.99,23985,2070,11.586956521739131,19895,2070,9.6111111111111107,10.19,'Split_Ceiling_Cassette LG 1.99TR SEER 10.19','Split_Ceiling_Cassette Carrier 1.96TR SEER 10.25'),
('Split_Ceiling_Cassette','Gree','GUHD36TS3CO','Inverter','2.5',2.66,32000,2760,11.594202898550725,26500,3190,8.307210031347962,9.83,'Split_Ceiling_Cassette Gree 2.66TR SEER 9.83','Inverter unit "No replacement"'),
('Split_Ceiling_Cassette','Ugine','UC-18K-C-1','Non-Inverter','1.5',1.36,16400,1900,8.6315789473684212,15300,2200,6.9545454545454541,7.62,'Split_Ceiling_Cassette Ugine 1.36TR SEER 7.62','Split_Ceiling_Cassette LG 1.5TR SEER 8.05'),
('Split_Ceiling_Cassette','Craft','DS24CE7HY7KM','Non-Inverter','2',1.93,23200,1933,12.002069322296947,20000,2353,8.4997875053123675,10.17,'Split_Ceiling_Cassette Craft 1.93TR SEER 10.17','Split_Ceiling_Cassette Carrier 1.96TR SEER 10.25'),
('Split_Ceiling_Cassette','LG','S322GHSD3','Non-Inverter','2',2.2000000000000002,26478.22192,3050,8.6813842360655737,23270.808440000001,3570,6.5184337366946776,7.49,'Split_Ceiling_Cassette LG 2.2TR SEER 7.49','Split_Ceiling_Cassette LG 2.31TR SEER 7.39'),
('Split_Ceiling_Cassette','Samsung','CC36BTVA1','Non-Inverter','2.5',2.66,32000,3300,9.6969696969696972,28000,3650,7.6712328767123283,8.4700000000000006,'Split_Ceiling_Cassette Samsung 2.66TR SEER 8.47','Split_Ceiling_Cassette Carrier 2.88TR SEER 10.05'),
('Split_Ceiling_Cassette','LG','LT-H242ELE0','Non-Inverter','2',2,24000,2500,9.6,20991,2830,7.4173144876325088,8.34,'Split_Ceiling_Cassette LG 2TR SEER 8.34','Split_Ceiling_Cassette LG 2.0TR SEER 8.33'),
('Split_Ceiling_Cassette','Zamil','SCX36HAXCD','Non-Inverter','3',2.83,34000,2800,12.142857142857142,28400,3350,8.4776119402985071,10.23,'Split_Ceiling_Cassette Zamil 2.83TR SEER 10.23','Split_Ceiling_Cassette Carrier 2.88TR SEER 10.05'),
('Split_Ceiling_Cassette','LG','LTUH242QLE0','Non-Inverter','2',1.75,21059,2470,8.5259109311740886,19005,2900,6.5534482758620687,7.42,'Split_Ceiling_Cassette LG 1.75TR SEER 7.42','Split_Ceiling_Cassette LG 1.75TR SEER 7.36'),
('Split_Ceiling_Cassette','LG','ATUW24GNT0','Non-Inverter','2',2,24034.188034188039,2070,11.610718857095671,19892,2070,9.609661835748792,10.209999999999999,'Split_Ceiling_Cassette LG 2TR SEER 10.21','Split_Ceiling_Cassette Carrier 1.96TR SEER 10.25'),
('Split_Ceiling_Cassette','Gree','GWC24ACE-C','Non-Inverter','2',1.83,22000,1880,11.702127659574469,18700,2255,8.2926829268292686,9.91,'Split_Ceiling_Cassette Gree 1.83TR SEER 9.91','Split_Ceiling_Cassette Carrier 1.96TR SEER 10.25'),
('Split_Ceiling_Cassette','Carrier','38QGJ024-323F','Non-Inverter','2',2,24000,2770,8.6642599277978345,null,null,null,null,null,'Split_Ceiling_Cassette LG 2.0TR SEER 8.33'),
('Split_Ceiling_Cassette','LG','LTNC242QLE0','Non-Inverter','2',1.75,21018.794720000002,2470,8.509633489878544,18698.53816,2900,6.4477717793103446,7.3599999999999994,'Split_Ceiling_Cassette LG 1.75TR SEER 7.36','Split_Ceiling_Cassette LG 1.75TR SEER 7.36'),
('Split_Ceiling_Cassette','LG','LT-C302FLE0','Non-Inverter','2.5',2.5,30000,2980,10.067114093959731,null,null,null,null,null,'Split_Ceiling_Cassette LG 2.32TR SEER 8.12'),
('Split_Ceiling_Cassette','Gree','GUTD24PHS1/A-S(S)','Non-Inverter','2.5',2.5,30000,2890,10.380622837370241,null,null,null,null,null,'Split_Ceiling_Cassette LG 2.32TR SEER 8.12'),
('Split_Ceiling_Cassette','Mando','Model1.1MADO','Non-Inverter','2',1.75,21059.829059829062,2470,8.5262465829267455,null,null,null,null,null,'Split_Ceiling_Cassette LG 1.75TR SEER 7.36'),
('Split_Ceiling_Cassette','General','AOS24AAWF','Non-Inverter','2',2,24034.188034188039,2070,11.610718857095671,null,null,null,null,null,'Split_Ceiling_Cassette LG 1.83TR SEER 10.59'),
('Split_Ceiling_Cassette','LG','LV-B2421HL','Non-Inverter','2',2,24000,2560,9.375,null,null,null,null,null,'Split_Ceiling_Cassette Carrier 1.96TR SEER 10.25'),
('Split_Ceiling_Cassette','LG','LTUH302PLE','Non-Inverter','2.5',2.5,30000,2980,10.067114093959731,null,null,null,null,null,'Split_Ceiling_Cassette LG 2.32TR SEER 8.12'),
('Split_Ceiling_Cassette','LG','LS-T242CBG-C','Non-Inverter','2',2,24000,2525,9.5049504950495045,null,null,null,null,null,'Split_Ceiling_Cassette Carrier 1.96TR SEER 10.25'),
('Split_Ceiling_Cassette','Carrier','38hkc60ds20-02','Non-Inverter','5',5,60000,6200,9.67741935483871,null,null,null,null,null,'Split_Ceiling_Cassette LG 4.21TR SEER 7.69'),
('Split_Ceiling_Cassette','Carrier','Wcs036HGIR1T-C','Non-Inverter','2.5',2.66,32000,2760,11.594202898550725,25000,3010,8.3056478405315612,9.7799999999999994,'Split_Ceiling_Cassette Carrier 2.66TR SEER 9.78','Split_Ceiling_Cassette Carrier 2.88TR SEER 10.05'),
('Split_Ceiling_Cassette','Carrier','42QTDA6024VS','Non-Inverter','2',2.25,27000,2250,12,24000,2810,8.5409252669039137,10.209999999999999,'Split_Ceiling_Cassette Carrier 2.25TR SEER 10.21','Split_Ceiling_Cassette LG 2.32TR SEER 8.12'),
('Split_Ceiling_Cassette','Carrier','42TNH0362002303','Non-Inverter','3',2.75,33000,4204,7.8496669838249282,null,null,null,null,null,'Split_Ceiling_Cassette Carrier 2.88TR SEER 10.05'),
('Window','Zamil','PCB19CKXQIMNW','Non-Inverter','1.5',1.52,18260,2360,7.7372881355932206,14260,2600,5.4846153846153847,6.51,'Window Zamil 1.52TR SEER 6.51','Window LG 1.5TR SEER 7.70'),
('Split_Wall_Mounted','York','YE6SD320SCYW41 / YE6HC32SC7AC41','Non-Inverter','2.5',2.4300000000000002,29225,2532,11.542259083728277,25893,3112,8.3203727506426741,9.85,'Split_Wall_Mounted York 2.43TR SEER 9.85','Split_Wall_Mounted LG 2.5TR SEER 10.43'),
('Split_Wall_Mounted','General','YE3HW30SH7AC22 / YE3SD30RSHYW22','Non-Inverter','2.5',2.5,30000,3990,7.518796992481203,25800,4750,5.4315789473684211,6.41,'Split_Wall_Mounted General 2.5TR SEER 6.41','Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Wall_Mounted','LG','BC36CCL','Non-Inverter','2.5',2.5299999999999998,30400,2500,12.16,null,null,null,null,null,'Split_Wall_Mounted Carrier 2.58TR SEER 10.41'),
('Window','Carrier','CACH19K5','Non-Inverter','1.5',1.55,18600,2450,7.591836734693878,15200,2830,5.3710247349823321,6.41,'Window Carrier 1.55TR SEER 6.41','Window Zamil 1.5TR SEER 6.51'),
('Window','Falcon','FCW19','Non-Inverter','1.5',1.55,18600,2450,7.591836734693878,null,null,null,null,null,'Window LG 1.5TR SEER 7.70'),
('Window','Falcon','FCWH 19K5','Non-Inverter','1.5',1.55,18600,2450,7.591836734693878,null,null,null,null,null,'Window LG 1.5TR SEER 7.70'),
('Window','Haas','HO19E8J','Non-Inverter','1.5',1.54,18500,2450,7.5510204081632653,null,null,null,null,null,'Window LG 1.5TR SEER 7.70'),
('Split_Wall_Mounted','Speed_Cool','SC-CCR24SHCZWXS','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3820,5.4031413612565444,6.3999999999999995,'Split_Wall_Mounted Speed_Cool 2TR SEER 6.4','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Speed_Cool','SC-EXGA24SHBC-1S','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3820,5.4031413612565444,6.3999999999999995,'Split_Wall_Mounted Speed_Cool 2TR SEER 6.4','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Kelvinator','KIZB24SH','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3820,5.4031413612565444,6.3999999999999995,'Split_Wall_Mounted Kelvinator 2TR SEER 6.4','Split_Wall_Mounted Zamil 1.83TR SEER 7.51'),
('Split_Wall_Mounted','Speed_Cool','SC-CCR24HCZWXS','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3820,5.4031413612565444,6.3999999999999995,'Split_Wall_Mounted Speed_Cool 2TR SEER 6.4','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','York','YE3HW24SH7AC22','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3820,5.4031413612565444,6.3999999999999995,'Split_Wall_Mounted York 2TR SEER 6.4','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','York','YE3HW18SH7BC22','Non-Inverter','1.5',1.5,18000,2390,7.531380753138075,15480,2850,5.4315789473684211,6.42,'Split_Wall_Mounted York 1.5TR SEER 6.42','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','York','YE3HW30SH7AC22','Non-Inverter','2.5',2.5,30000,3990,7.518796992481203,25800,4750,5.4315789473684211,6.41,'Split_Wall_Mounted York 2.5TR SEER 6.41','Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Wall_Mounted','LG','S3024HNV0','Non-Inverter','2.5',2.33,27989,3450,8.1127536231884054,26478,4000,6.6195000000000004,7.2,'Split_Wall_Mounted LG 2.33TR SEER 7.2','Split_Wall_Mounted Zamil 2.11TR SEER7.24'),
('Split_Wall_Mounted','Speed_Cool','SC-EXGA24SHBCIS','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3820,5.4031413612565444,6.3999999999999995,'Split_Wall_Mounted Speed_Cool 2TR SEER 6.4','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','LG','S3224C','Non-Inverter','2.5',2.4700000000000002,29685.635399999999,3600,8.2460098333333338,25932.279200000001,4200,6.1743521904761911,7.1,'Split_Wall_Mounted LG 2.47TR SEER 7.1','Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Wall_Mounted','Pearl','EZA30SHACL','Non-Inverter','2.5',2.5,30000,3984,7.5301204819277112,25800,4750,5.4315789473684211,6.41,'Split_Wall_Mounted Pearl 2.5TR SEER 6.41','Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Wall_Mounted','Gree','GWH18MC-DINTA8A/I','Non-Inverter','1.5',1.5,18083,2220,8.1454954954954957,15695,2700,5.8129629629629633,6.92,'Split_Wall_Mounted Gree 1.5TR SEER 6.92','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','York','YE3SD180SHBW22-2','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3820,5.4031413612565444,6.3999999999999995,'Split_Wall_Mounted York 2TR SEER 6.4','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Speed_Cool','SC-EXGA24HBC1S','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3820,5.4031413612565444,6.3999999999999995,'Split_Wall_Mounted Speed_Cool 2TR SEER 6.4','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Speed_Cool','SC-EXGA24SHBC1S','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3820,5.4031413612565444,6.3999999999999995,'Split_Wall_Mounted Speed_Cool 2TR SEER 6.4','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Speed_Cool','SC-EXGA24SHBC','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3820,5.4031413612565444,6.3999999999999995,'Split_Wall_Mounted Speed_Cool 2TR SEER 6.4','Split_Wall_Mounted Zamil 1.83TR SEER 7.51'),
('Split_Wall_Mounted','Speed_Cool','SC-EXGA243HBC','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3820,5.4031413612565444,6.3999999999999995,'Split_Wall_Mounted Speed_Cool 2TR SEER 6.4','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Kleenair','KT3F-51G','Non-Inverter','1.5',1.45,17400,2190,7.9452054794520546,15300,2550,6,6.8599999999999994,'Split_Wall_Mounted Kleenair 1.45TR SEER 6.86','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','PEARL','CCT24PHCZWS','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3820,5.4031413612565444,6.3999999999999995,'Split_Wall_Mounted PEARL 2TR SEER 6.4','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','York','YE3SD180SHZW22','Non-Inverter','1.5',1.5,18000,2390,7.531380753138075,15480,2850,5.4315789473684211,6.42,'Split_Wall_Mounted York 1.5TR SEER 6.42','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','York','YE3SD240SHZW22','Non-Inverter','2',2,24000,3191,7.521153243497336,20640,3820,5.4031413612565444,6.3999999999999995,'Split_Wall_Mounted York 2TR SEER 6.4','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Gree','GWH18MC-D1NTA','Non-Inverter','1.5',1.5,18083,2220,8.1454954954954957,15695,2700,5.8129629629629633,6.92,'Split_Wall_Mounted Gree 1.5TR SEER 6.92','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','York','YE3SD240SHZW22 / YE3HW24SH7AC22','Non-Inverter','2',2,24000,3100,7.741935483870968,20640,3820,5.4031413612565444,6.54,'Split_Wall_Mounted York 2TR SEER 6.54','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','York','YE3SD180SHZW22 / YE3HW18SH7BC22','Non-Inverter','1.5',1.5,18000,2390,7.531380753138075,15480,2850,5.4315789473684211,6.42,'Split_Wall_Mounted York 1.5TR SEER 6.42','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','York','YE3HC30SH7AC22 / YE3SD30RSHYW22','Non-Inverter','2.5',2.5,30000,3990,7.518796992481203,25800,4750,5.4315789473684211,6.41,'Split_Wall_Mounted York 2.5TR SEER 6.41','Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Floor_Standing','York','YE3SD60SEHAA22 / YE3FS60SH7AA22','Non-Inverter','5',5,60000,7980,7.518796992481203,51600,9500,5.4315789473684211,6.41,'Split_Floor_Standing York 5TR SEER 6.41','Split_Floor_Standing LG 4.5TR SEER 10.00'),
('Split_Wall_Mounted','Mando','YE3SD30RSHYW22 / YE3HW30SH7AC22','Non-Inverter','2.5',2.5,30000,3990,7.518796992481203,25800,4750,5.4315789473684211,6.41,'Split_Wall_Mounted Mando 2.5TR SEER 6.41','Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Floor_Standing','York','MFTGA50CRN / MFTGA50CRN','Non-Inverter','4',3.86,46403,3824,12.134675732217573,41381,4794,8.6318314559866494,10.32,'Split_Floor_Standing York 3.86TR SEER 10.32','Split_Floor_Standing LG 3.75TR SEER 7.47'),
('Split_Wall_Mounted','York','YE3SD240SHZW22 / YE3HW24SH7BC22','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3820,5.4031413612565444,6.3999999999999995,'Split_Wall_Mounted York 2TR SEER 6.4','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','York','YE3SD24RSHZW22 / YE3HC24SH3BC22','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3820,5.4031413612565444,6.3999999999999995,'Split_Wall_Mounted York 2TR SEER 6.4','Split_Wall_Mounted Zamil 1.83TR SEER 7.51'),
('Split_Wall_Mounted','York','YE3SD30RSHYW22-I / YE3HC30SH7AC22','Non-Inverter','2.5',2.5,30000,3990,7.518796992481203,25800,4750,5.4315789473684211,6.41,'Split_Wall_Mounted York 2.5TR SEER 6.41','Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Wall_Mounted','LG','YE3SD240SHZW22 / YE3HC24SH7BC22','Non-Inverter','2',2,24000,3100,7.741935483870968,20640,3820,5.4031413612565444,6.54,'Split_Wall_Mounted LG 2TR SEER 6.54','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Bancool','YE3SD30RSHYW22 / YE3HW30SH7AB22','Non-Inverter','2.5',2.5,30000,3990,7.518796992481203,25800,4750,5.4315789473684211,6.41,'Split_Wall_Mounted Bancool 2.5TR SEER 6.41','Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Wall_Mounted','LG','S24A2MR','Non-Inverter','2',2,24000,3050,7.8688524590163933,null,null,null,null,null,'Split_Wall_Mounted DAEWOO 2TR SEER 7.86'),
('Split_Wall_Mounted','York','YE3CF18SH7BC22','Non-Inverter','1.5',1.5,18000,2390,7.531380753138075,null,null,null,null,null,'Split_Wall_Mounted LG 1.46TR SEER 7.56'),
('Split_Wall_Mounted','General','AD1GH24SA2','Non-Inverter','1.5',1.56,18835.023840000002,2500,7.534009536000001,null,null,null,null,null,'Split_Wall_Mounted LG 1.46TR SEER 7.56'),
('Split_Wall_Mounted','LG','LS-H322MMB0','Non-Inverter','2.5',2.66,32000,4200,7.6190476190476186,null,null,null,null,null,'Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Wall_Mounted','York','YTHA28OSAADA','Non-Inverter','2',2.29,27500,3354,8.1991651759093624,null,null,null,null,null,'Split_Wall_Mounted LG 2.21TR SEER 8.14'),
('Split_Wall_Mounted','York','YE3HC18SH7BC22','Non-Inverter','1.5',1.5,18000,2390,7.531380753138075,15480,2850,5.4315789473684211,6.42,'Split_Wall_Mounted York 1.5TR SEER 6.42','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','Classic','KXC18CSIHIQ - ADX18EHAXFQ','Non-Inverter','1.5',1.49,17995,2250,7.9977777777777774,14996,2500,5.9984000000000002,6.87,'Split_Wall_Mounted Classic 1.49TR SEER 6.87','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','LG','S3624HUV0','Non-Inverter','2.5',2.66,32005,3850,8.3129870129870138,28012,4600,6.0895652173913044,7.12,'Split_Wall_Mounted LG 2.66TR SEER 7.12','Split_Wall_Mounted Royal Temp 2.67TR SEER 7.44'),
('Split_Wall_Mounted','York','YE3SD30RSHYW22-1','Non-Inverter','2.5',2.5,30000,3990,7.518796992481203,25800,4750,5.4315789473684211,6.41,'Split_Wall_Mounted York 2.5TR SEER 6.41','Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Wall_Mounted','Classic','HWX36EHAYGQ','Non-Inverter','3',2.79,33489,4100,8.1680487804878048,27992,4560,6.1385964912280704,7.02,'Split_Wall_Mounted Classic 2.79TR SEER 7.02','Split_Wall_Mounted Carrier 2.75TR SEER 8.81'),
('Split_Wall_Mounted','LG','S3624HNV0','Non-Inverter','2.5',2.66,32005,3850,8.3129870129870138,28013,4600,6.0897826086956526,7.12,'Split_Wall_Mounted LG 2.66TR SEER 7.12','Split_Wall_Mounted Royal Temp 2.67TR SEER 7.44'),
('Split_Wall_Mounted','Classic','KXC36CSIHAQ','Non-Inverter','3',2.79,33490,4100,8.168292682926829,27993,4560,6.1388157894736839,7.02,'Split_Wall_Mounted Classic 2.79TR SEER 7.02','Split_Wall_Mounted LG 2.6TR SEER 7.18'),
('Split_Wall_Mounted','Queen','HQSGO 18H','Non-Inverter','1.5',1.5,18083,2220,8.1454954954954957,15695,2700,5.8129629629629633,6.92,'Split_Wall_Mounted Queen 1.5TR SEER 6.92','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','Speed_Cool','UTS18LSHR','Non-Inverter','1.5',1.5,18000,2250,8,null,null,null,null,null,'Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','LG','NF242C3NK0','Inverter','2',1.79,21500,1734,12.399077277970012,18500,2127,8.6976962858486129,null,'Split_Wall_Mounted LG 1.79TR SEER Inverter','Inverter unit "No replacement"'),
('Split_Wall_Mounted','LG','NS182C2NK0','Inverter','1.5',1.5,18000,1452,12.396694214876034,15300,1759,8.6981239340534398,null,'Split_Wall_Mounted LG 1.5TR SEER Inverter','Inverter unit "No replacement"'),
('Split_Wall_Mounted','LG','NS242H3NK0','Inverter','2',1.79,21500,1734,12.399077277970012,18500,2127,8.6976962858486129,null,'Split_Wall_Mounted LG 1.79TR SEER Inverter','Inverter unit "No replacement"'),
('Split_Wall_Mounted','LG','NS182C2','Inverter','1.5',1.5,18000,1452,12.396694214876034,15300,1759,8.6981239340534398,null,'Split_Wall_Mounted LG 1.5TR SEER Inverter','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Panasonic','CS-YW24WKS','Inverter','2',1.75,21000,1721,12.20220801859384,19200,2207,8.6995922066153142,null,'Split_Wall_Mounted Panasonic 1.75TR SEER Inverter','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Zamil','MRZ24CDGHIAD1','Inverter','2',1.83,22000,1781,12.352610892756879,18434.188034188035,2114,8.720051104157065,null,'Split_Wall_Mounted Zamil 1.83TR SEER Inverter','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Samsung','AR24JQFNCWKN','Inverter','1.5',1.66,20000,1630,12.269938650306749,16500,1930,8.5492227979274613,null,'Split_Wall_Mounted Samsung 1.66TR SEER Inverter','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Samsung','AR30JSFUCWKN','Inverter','2',2.2000000000000002,26500,2300,11.521739130434783,22000,2650,8.3018867924528301,null,'Split_Wall_Mounted Samsung 2.2TR SEER Inverter','Inverter unit "No replacement"'),
('Split_Wall_Mounted','LG','NS182C2UK0','Inverter','1.5',1.5,18000,1452,12.396694214876034,15300,1759,8.6981239340534398,null,'Split_Wall_Mounted LG 1.5TR SEER Inverter','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Zamil','MAZ24CHXAD1','Non-Inverter','2',1.83,22000,1781,12.352610892756879,18434.188034188035,2114,8.720051104157065,10.44,'Split_Wall_Mounted Zamil 1.83TR SEER 10.44','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Floor_Standing','Kelvinator','KIQ060SHAA','Non-Inverter','5',5,60000,7980,7.518796992481203,51600,9500,5.4315789473684211,6.41,'Split_Floor_Standing Kelvinator 5TR SEER 6.41','Split_Floor_Standing LG 4.5TR SEER 10.00'),
('Split_Floor_Standing','LG','LP-K3023HL','Non-Inverter','2',2.2999999999999998,27638.350200000001,3420,8.0813889473684206,21837.7088,3730,5.854613619302949,6.85,'Split_Floor_Standing LG 2.3TR SEER 6.85','No Equivalent Found provide Pic & Datasheets'),
('Split_Floor_Standing','York','YE3SD60SECAA22 / YE3FS60SC7AA22','Non-Inverter','5',5,60000,7980,7.518796992481203,51600,9500,5.4315789473684211,6.41,'Split_Floor_Standing York 5TR SEER 6.41','Split_Floor_Standing LG 4.5TR SEER 10.00'),
('Split_Wall_Mounted','York','YE5SD240SHZW22 / YE5HC24SH7BC22','Non-Inverter','2',1.87,22500,2361,9.529860228716645,19870,2863,6.9402724414949351,8.15,'Split_Wall_Mounted York 1.87TR SEER 8.15','Split_Wall_Mounted LG 1.74TR SEER 8.17'),
('Split_Wall_Mounted','Midea','SHDC24ON-GDE / SHEC24ON-BDE','Non-Inverter','2',1.91,23000,1870,12.299465240641711,19800,2275,8.7032967032967026,10.42,'Split_Wall_Mounted Midea 1.91TR SEER 10.42','Split_Wall_Mounted Zamil 1.83TR SEER 10.42'),
('Split_Wall_Mounted','LG','LP-K3023CL','Non-Inverter','2.5',2.5,30000,3400,8.8235294117647065,null,null,null,null,null,'Split_Wall_Mounted Carrier 2.75TR SEER 8.81'),
('Split_Floor_Standing','LG','LP-5091NC','Non-Inverter','4',4.16,50000,6000,8.3333333333333339,null,null,null,null,null,'Split_Floor_Standing LG 4.49TR SEER 8.28'),
('Split_Floor_Standing','Mitsubishi','PUH-6TKSA','Non-Inverter','5',5,60000,5870,10.221465076660989,null,null,null,null,null,'Split_Floor_Standing LG 4.5TR SEER 10.00'),
('Split_Floor_Standing','GoldStar','LP-5090NH','Non-Inverter','4',4.16,50000,6000,8.3333333333333339,null,null,null,null,null,'Split_Floor_Standing LG 4.49TR SEER 8.28'),
('Split_Floor_Standing','LAKES','LFAC-50H/A','Non-Inverter','4',4.16,50000,5990,8.3472454090150254,null,null,null,null,null,'Split_Floor_Standing LG 4.49TR SEER 8.28'),
('Split_Wall_Mounted','York','YE8CF24SC7AC41','Non-Inverter','2',2,24000,2000,12,21400,2503,8.5497403116260493,10.209999999999999,'Split_Wall_Mounted York 2TR SEER 10.21','Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','LG','LVNC242BLA0','Non-Inverter','2',2,24100,2600,9.2692307692307701,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','Samsung','FC24BTVA','Non-Inverter','2',1.91,23000,2700,8.518518518518519,null,null,null,null,null,'Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','Trane','4MXDUA18T1000AA','Non-Inverter','1.5',1.48,17800,1480,12.027027027027026,16000,1850,8.6486486486486491,10.27,'Split_Wall_Mounted Trane 1.48TR SEER 10.27','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Floor_Standing','Samsung','AF55JV1MAEEN','Inverter','4',4,48000,3930,12.213740458015268,42000,4950,8.4848484848484844,null,'Split_Floor_Standing Samsung 4TR SEER Inverter','Inverter unit "No replacement"'),
('Split_Ceiling_Ducted','York','YE3Cf24CS7AC22','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3800,5.4315789473684211,6.41,'Split_Ceiling_Ducted York 2TR SEER 6.41','Split_Ceiling_Ducted YORK 2TR SEER 6.41'),
('Split_Ceiling_Cassette','Goodman','ECM24SHAC','Non-Inverter','2',2,24000,3190,7.523510971786834,20640,3800,5.4315789473684211,6.41,'Split_Ceiling_Cassette Goodman 2TR SEER 6.41','Split_Ceiling_Cassette Mitsubishi 2.02TR SEER 6.93'),
('Window','Hyundai ','HYWAC1810C','Non-Inverter','1.5',1.48,17844.759999999998,2180,8.18,0,0,null,null,'Window Hyundai  1.48TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','Horizon','WR184HBPA','Non-Inverter','1.5',1.5,18000,2500,7.2,0,0,null,null,'Window Horizon 1.5TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','General','ARM18KEM2','Non-Inverter','1.5',1.5,18000,0,null,0,0,null,null,'Window General 1.5TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','Zamil','LCB19CTXCIING','Non-Inverter','1.5',1.58,19000,2150,8.83,13750,2350,5.8510638297872344,7.26,'Window Zamil 1.58TR SEER 7.26','Window LG 1.49TR SEER 7.24'),
('Window','Coolsense','AMJCSP24WAC','Non-Inverter','1.5',1.7,20500,1990.2912621359221,10.3,0,0,null,null,'Window Coolsense 1.7TR SEER -','Window York  1.75TR SEER 8.45'),
('Window','General Electric ','ARM18KAJ','Non-Inverter','1.5',1.5,18000,2900,6.2,0,0,null,null,'Window General Electric  1.5TR SEER -','Window Zamil 1.5TR SEER 6.51'),
('Window','Toshiba ','RAC-18LE2B','Non-Inverter','1.5',1.5,18000,0,null,0,0,null,null,'Window Toshiba  1.5TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','Carrier','51GVD218-3','Non-Inverter','1.5',1.5,18000,2450,7.34,14193.92,2750,5.161425454545455,6.98,'Window Carrier 1.5TR SEER 6.98','Window Zamil 1.5TR SEER 6.51'),
('Window','Alessa','CO19E8Y1','Non-Inverter','1.5',1.54,18500,2320,7.97,0,0,null,null,'Window Alessa 1.54TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','Amana','624-3HW','Non-Inverter','2',1.91,23000,3565,6.45,0,0,null,null,'Window Amana 1.91TR SEER -','Window Royal Temp 2TR SEER 6.41'),
('Window','Craft','O19E8JI','Non-Inverter','1.5',1.54,18500,2450,7.55,0,0,null,null,'Window Craft 1.54TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','Craft','AO19E8A2','Non-Inverter','1.5',1.5,18000,2480,7.25,0,0,null,null,'Window Craft 1.5TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','Craft','O19E8H4','Non-Inverter','1.5',1.47,17742.399999999998,1948,9.1,0,0,null,null,'Window Craft 1.47TR SEER -','Window Carrier 1.5TR SEER 8.62'),
('Window','Falcon','NECH19L','Non-Inverter','1.5',1.55,18600,2450,7.59,0,0,null,null,'Window Falcon 1.55TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','Falcon','FSE24','Non-Inverter','2',2,24000,2970,8.08,0,0,null,null,'Window Falcon 2TR SEER -','Window LG 2TR SEER 7.48'),
('Window','Falcon','NFCH19L','Non-Inverter','1.5',1.55,18600,2450,7.59,0,0,null,null,'Window Falcon 1.55TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','Friedrich','NH230','Non-Inverter','2',1.91,23000,3300,6.96,0,0,null,null,'Window Friedrich 1.91TR SEER -','Window LG 2TR SEER 7.48'),
('Window','General','AXS-S','Non-Inverter','2',1.8,21600,2429.6962879640046,8.89,18300,2900.1584786053886,6.31,7.53,'Window General 1.8TR SEER 7.53','Window Zamil 1.88TR SEER 7.28'),
('Window','General ','ARJ24BDS1','Non-Inverter','2',1.84,22092.7,2890,7.64,0,0,null,null,'Window General  1.84TR SEER -','Window LG 2TR SEER 7.48'),
('Window','General ','EWAH 19K5-W','Non-Inverter','1.5',1.55,18600,2450,7.59,0,0,null,null,'Window General  1.55TR SEER -','Window Zamil 1.5TR SEER 6.51'),
('Window','General_Supreme','GS183AH','Non-Inverter','1.5',1.48,17800,2057.8034682080925,8.65,0,0,null,null,'Window General_Supreme 1.48TR SEER -','Window Carrier 1.5TR SEER 8.62'),
('Window','GIBSON','AK18E8NHBB-25kW','Non-Inverter','1.5',1.5,18000,3000,6,0,0,null,null,'Window GIBSON 1.5TR SEER -','Window Zamil 1.5TR SEER 6.51'),
('Window','Gree','GJE18AG-D1MTD5E','Non-Inverter','1.5',1.41,17000,1830,9.2799999999999994,14600,2200,6.6363636363636367,7.89,'Window Gree 1.41TR SEER 7.89','Window LG 1.5TR SEER 7.70'),
('Window','Kelvinator','KSVR243M-OM','Non-Inverter','2',2,24000,2700,8.8800000000000008,0,0,null,null,'Window Kelvinator 2TR SEER -','Window LG 2TR SEER 7.48'),
('Window','Kelvinator','SAKH19','Non-Inverter','1.5',1.54,18563,0,null,0,0,null,null,'Window Kelvinator 1.54TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','Kelvinator','KSVD243M-1C','Non-Inverter','2',2,24000,2600,9.23,24000,2800,8.5714285714285712,null,'Window Kelvinator 2TR SEER -','Window LG 2TR SEER 7.48'),
('Window','Kelvinator','KSVD183M-0K','Non-Inverter','1.5',1.5,18000,2200,8.18,15000,2500,6,6.98,'Window Kelvinator 1.5TR SEER 6.98','Window LG 1.39TR SEER 7.03'),
('Window','Kelvinator','KSVR183M-OM','Non-Inverter','1.5',1.5,18000,0,null,0,0,null,null,'Window Kelvinator 1.5TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','LG','E182BR','Non-Inverter','1.5',1.48,17878.88,1820,9.82,15354,2170,7.0755760368663596,8.36,'Window LG 1.48TR SEER 8.36','Window Carrier 1.43TR SEER 8.52'),
('Window','LG','LWH242MFAB1','Non-Inverter','2',2,24000,2560,9.3699999999999992,0,0,null,null,'Window LG 2TR SEER -','Window LG 2TR SEER 7.48'),
('Window','MESTCOOL','MZVR183M-OS3','Non-Inverter','1.5',1.5,18000,2068.9655172413795,8.6999999999999993,0,0,null,null,'Window MESTCOOL 1.5TR SEER -','Window Carrier 1.5TR SEER 8.62'),
('Window','ALESSA','DO19EBJ','Non-Inverter','1.5',1.5,18000,2375,7.57,0,0,null,null,'Window ALESSA 1.5TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','Other','AO18E8NHBC','Non-Inverter','1.5',1.5,18000,0,null,0,0,null,null,'Window Other 1.5TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','QUEEN ','HQ19HC','Non-Inverter','1.5',1.55,18600,2450,7.59,0,0,null,null,'Window QUEEN  1.55TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','Sharp','AF-180H7MC','Non-Inverter','1.5',1.5,18000,2080,8.65,0,0,null,null,'Window Sharp 1.5TR SEER -','Window Carrier 1.5TR SEER 8.62'),
('Window','Shogun','SHWH18M2H','Non-Inverter','1.5',1.5,18000,2250,8,0,0,null,null,'Window Shogun 1.5TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','Starway','WAC18KHCN','Non-Inverter','1.5',1.46,17600,0,null,0,0,null,null,'Window Starway 1.46TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','York','6AY-19','Non-Inverter','1.5',1.54,18563,0,null,0,0,null,null,'Window York 1.54TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','York','SAYH19','Non-Inverter','1.5',1.54,18563,0,null,0,0,null,null,'Window York 1.54TR SEER -','Window LG 1.5TR SEER 7.70'),
('Window','Zamil','KOT18PECA','Non-Inverter','1.5',1.5,18000,2390,7.53,15480,2850,5.4315789473684211,6.41,'Window Zamil 1.5TR SEER 6.41','Window Zamil 1.5TR SEER 6.51'),
('Window','Ugine','UGNW18E','Non-Inverter','1.5',1.5,18000,0,null,0,0,null,null,null,'Window LG 1.5TR SEER 7.70'),
('Split_Wall_Mounted','Kelvinator',' HBPUDC24','Non-Inverter','2',2,24000,3190,7.52,20640,3801.104972375691,5.43,6.4,'Split_Wall_Mounted Kelvinator 2TR SEER 6.4','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','General Electric ','AA1MH','Non-Inverter','2',2.16,25992,0,null,0,0,null,null,null,'Split_Wall_Mounted Zamil 2.12TR SEER 8.09'),
('Split_Wall_Mounted','omnia','AC-2450H','Non-Inverter','2',2,24000,2785,8.61,0,0,null,null,null,'Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','flix','AO-S-FLX-2400-H','Non-Inverter','1.5',1.62,19550,1700,11.5,17264,2080,8.3000000000000007,9.81,'Split_Wall_Mounted flix 1.62TR SEER 9.81','Split_Wall_Mounted Zamil 1.47TR SEER 9.8'),
('Split_Wall_Mounted','Zamil','ADL18EHAXIW','Non-Inverter','1.5',1.5,18000,0,null,0,0,null,null,null,'Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','Zamil','ADL24EHAXIW','Non-Inverter','2',2,24000,0,null,0,0,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 10.39'),
('Split_Wall_Mounted','Zamil','ADX18EHAXI','Non-Inverter','2',2,24000,0,null,0,0,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 10.39'),
('Split_Wall_Mounted','sharp','AH-A18WCS','Non-Inverter','1.5',1.5,18000,1481,12.15,15000,1754.3859649122805,8.5500000000000007,10.25,'Split_Wall_Mounted sharp 1.5TR SEER 10.25','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','Samsung','AR18KRFHCWKNMG','Non-Inverter','1.5',1.43,17200,1480,11.62,15000,1775.147928994083,8.4499999999999993,9.92,'Split_Wall_Mounted Samsung 1.43TR SEER 9.92','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','Aukia','ASTW-24B2/KDA','Non-Inverter','2',1.91,22996.880000000001,2460,9.34,19994.32,3038.6504559270516,6.58,7.91,'Split_Wall_Mounted Aukia 1.91TR SEER 7.91','Split_Wall_Mounted Carrier 1.81TR SEER 7.91'),
('Split_Wall_Mounted','Aukia','Aukp24cc','Non-Inverter','2',1.84,22178,1820,12.18,19107,2196.2068965517242,8.6999999999999993,10.34,'Split_Wall_Mounted Aukia 1.84TR SEER 10.34','Split_Wall_Mounted Crown 1.79TR SEER 10.33'),
('Split_Wall_Mounted','AUX','AUX18CDC','Non-Inverter','1.5',1.53,18400,1610,11.42,15422.24,1800.0000000000002,8.5679111111111101,9.81,'Split_Wall_Mounted AUX 1.53TR SEER 9.81','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','LG','B2428H','Non-Inverter','1.5',1.74,20949.68,1820,11.51,18936.599999999999,2278.7725631768949,8.31,9.84,'Split_Wall_Mounted LG 1.74TR SEER 9.84','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Coolex','CCO-030','Non-Inverter','2',2.0099999999999998,24194,2043,11.84,20847,2467.1005917159764,8.4499999999999993,10.050000000000001,'Split_Wall_Mounted Coolex 2.01TR SEER 10.05','Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','Champion ','CHSL180C','Non-Inverter','1.5',1.53,18400,1510,12.18,15800,1795.4545454545453,8.8000000000000007,10.37,'Split_Wall_Mounted Champion  1.53TR SEER 10.37','Split_Wall_Mounted Okia 1.53TR SEER 10.37'),
('Split_Wall_Mounted','Champion ','CHSS-12H','Non-Inverter','1',0.89,10747.8,1250,8.59,8250.2160000000003,1374,6.004524017467249,7.2,'Split_Wall_Mounted Champion  0.89TR SEER 7.2','Split_Wall_Mounted LG 0.95TR SEER 7.9')
on conflict (equipment_type, model_no) do update set
  make = excluded.make,
  compressor_type = excluded.compressor_type,
  size_category = excluded.size_category,
  tr = excluded.tr,
  t1_btu = excluded.t1_btu,
  t1_w = excluded.t1_w,
  t1_eer = excluded.t1_eer,
  t3_btu = excluded.t3_btu,
  t3_w = excluded.t3_w,
  t3_eer = excluded.t3_eer,
  equivalent_seer = excluded.equivalent_seer,
  surveyed_unit_description = excluded.surveyed_unit_description,
  equivalent_ac_model_description = excluded.equivalent_ac_model_description
where (t.make, t.compressor_type, t.size_category, t.tr, t.t1_btu, t.t1_w, t.t1_eer, t.t3_btu, t.t3_w, t.t3_eer, t.equivalent_seer, t.surveyed_unit_description, t.equivalent_ac_model_description)
   is distinct from (excluded.make, excluded.compressor_type, excluded.size_category, excluded.tr, excluded.t1_btu, excluded.t1_w, excluded.t1_eer, excluded.t3_btu, excluded.t3_w, excluded.t3_eer, excluded.equivalent_seer, excluded.surveyed_unit_description, excluded.equivalent_ac_model_description);

-- >>> CHUNK 6/11 — old_model_registry rows 1001-1200 of 1516
insert into public.old_model_registry as t (equipment_type, make, model_no, compressor_type, size_category, tr, t1_btu, t1_w, t1_eer, t3_btu, t3_w, t3_eer, equivalent_seer, surveyed_unit_description, equivalent_ac_model_description) values
('Split_Wall_Mounted','Blue power','CSA-24CH','Non-Inverter','1.5',1.73,20813.2,2320,8.9700000000000006,17742.399999999998,2656.0479041916165,6.68,7.7,'Split_Wall_Mounted Blue power 1.73TR SEER 7.7','Split_Wall_Mounted Carrier 1.75TR SEER 7.63'),
('Split_Wall_Mounted','Panasonic','CS-YV18TKS','Non-Inverter','1.5',1.47,17742,1504,11.79,15886,1868.9411764705883,8.5,10.07,'Split_Wall_Mounted Panasonic 1.47TR SEER 10.07','Split_Wall_Mounted LG 1.47TR SEER 10.15'),
('Split_Wall_Mounted','Craft','DSA25CE7GR7N','Non-Inverter','1.5',1.79,21500,1822,11.8,17700,2082.3529411764707,8.5,10.01,'Split_Wall_Mounted Craft 1.79TR SEER 10.01','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','Craft','DSW24FE7HY7M','Non-Inverter','2',1.83,22000,1870,11.76,19400,2250,8.6222222222222218,10.08,'Split_Wall_Mounted Craft 1.83TR SEER 10.08','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','dansat','dac-18wch','Non-Inverter','1.5',1.49,17913,1450,12.35,15350,1760.0000000000002,8.7215909090909083,10.45,'Split_Wall_Mounted dansat 1.49TR SEER 10.45','Split_Wall_Mounted LG 1.5TR SEER 10.46'),
('Split_Wall_Mounted','Craft','DS18FE7SCWT','Non-Inverter','1.5',1.5,18000,1475,12.2,15500,1822.9999999999998,8.502468458584751,10.29,'Split_Wall_Mounted Craft 1.5TR SEER 10.29','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','Craft','DSA120FE7H','Non-Inverter','1.5',1.5,18000,1450,12.41,15300,1758.6206896551726,8.6999999999999993,10.47,'Split_Wall_Mounted Craft 1.5TR SEER 10.47','Split_Wall_Mounted LG 1.5TR SEER 10.46'),
('Split_Wall_Mounted','Craft','DSA125FE7H','Non-Inverter','2',1.83,22000,1775,12.39,19000,2196.5317919075142,8.65,10.46,'Split_Wall_Mounted Craft 1.83TR SEER 10.46','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Craft','DSA24FE7YHA1','Non-Inverter','2',1.91,23000,1855,12.39,19800,2275,8.7032967032967026,10.48,'Split_Wall_Mounted Craft 1.91TR SEER 10.48','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Kelvinator','Eza18sh/GQR183MIO-M0','Non-Inverter','1.5',1.5,18000,2390,7.53,15480,2850,5.4315789473684211,6.41,'Split_Wall_Mounted Kelvinator 1.5TR SEER 6.41','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','Galanz','GACSH-18H','Non-Inverter','1.5',1.5,18000,2040,8.82,8530,1343.3070866141734,6.35,7.22,'Split_Wall_Mounted Galanz 1.5TR SEER 7.22','Split_Wall_Mounted LG 1.46TR SEER 7.28'),
('Split_Wall_Mounted','General','GENP24HRS','Non-Inverter','2',1.83,22000,1800,12.22,18800,2200,8.545454545454545,10.31,'Split_Wall_Mounted General 1.83TR SEER 10.31','Split_Wall_Mounted Crown 1.79TR SEER 10.33'),
('Split_Wall_Mounted','Kelvinator','KIZB18SH','Non-Inverter','1.5',1.42,17040,1500,11.36,15097,1818.9156626506021,8.3000000000000007,9.73,'Split_Wall_Mounted Kelvinator 1.42TR SEER 9.73','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','Kelvinator','HBPUDC18','Non-Inverter','1.5',1.5,18000,2390,7.53,15480,2850.8287292817681,5.43,6.41,'Split_Wall_Mounted Kelvinator 1.5TR SEER 6.41','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','Queen ','Hqit24h','Non-Inverter','1.5',1.71,20523.18,2550,8.0399999999999991,0,0,null,null,null,'Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','Queen','HQSMI24H','Non-Inverter','1.5',1.79,21495.599999999999,3500,6.14,0,0,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Queen ','HQSMI30H','Non-Inverter','2',1.83,22007.399999999998,3700,5.94,0,0,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Haas','HSA12FE7HH7','Non-Inverter','1',1,12000,985,12.18,10500,1160,9.0517241379310338,10.47,'Split_Wall_Mounted Haas 1TR SEER 10.47','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Haas','Hsa18fe7hg','Non-Inverter','1.5',1.5,18000,0,null,0,0,null,null,null,'Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','Kelvinator','Hscu24hb','Non-Inverter','2',2,24000,0,null,0,0,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 10.39'),
('Split_Wall_Mounted','Haier','HSU-18HEK13','Non-Inverter','1.5',1.42,17060,1680,10.15,14671.6,1900,7.7218947368421054,8.76,'Split_Wall_Mounted Haier 1.42TR SEER 8.76','Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','Zamil','HWX18EHAXH','Non-Inverter','1.5',1.5,18000,0,null,0,0,null,null,null,'Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','Kayannenergy','KAYANN-ENERGY-18K-H-SAGA-105','Non-Inverter','1.5',1.45,17400,1810,9.61,14300,1958.9041095890411,7.3,8.26,'Split_Wall_Mounted Kayannenergy 1.45TR SEER 8.26','Split_Wall_Mounted LG 1.53TR SEER 8.30'),
('Split_Wall_Mounted','Mando','KFR-61GW/a.','Non-Inverter','2',2,24000,2600,9.23,24500,2640.0862068965521,9.2799999999999994,8.68,'Split_Wall_Mounted Mando 2TR SEER 8.68','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','Haam','KT3FR-36GW/a','Non-Inverter','1',0.9,10918.4,1200,9.09,9553.6,1392.6530612244899,6.8599999999999994,7.85,'Split_Wall_Mounted Haam 0.9TR SEER 7.85','Split_Wall_Mounted LG 0.95TR SEER 7.9'),
('Split_Wall_Mounted','TOPTEC','KT3FR-50GW/60','Non-Inverter','1.5',1.5,18000,2250,8,0,0,null,null,null,'Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','Max plus','Maxksa30c','Non-Inverter','2',2.1800000000000002,26170,2200,11.89,0,0,null,null,null,'Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','Mitsubishi','Ms-18nn','Non-Inverter','1.5',1.5,18000,0,null,0,0,null,null,null,'Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','NIKAI','NSAC-1836','Non-Inverter','1.5',1.5,18000,2190,8.2100000000000009,0,0,null,null,null,'Split_Wall_Mounted LG 1.52TR SEER 8.15'),
('Split_Wall_Mounted','Rantic','OMR-18CH','Non-Inverter','1.5',1.45,17401.2,1950,8.92,15354,2248.0234260614934,6.83,7.73,'Split_Wall_Mounted Rantic 1.45TR SEER 7.73','Split_Wall_Mounted Royal Temp 1.5TR SEER 7.67'),
('Split_Wall_Mounted','GENERAL GOLDIN','ONG-1 EKC','Non-Inverter','1.5',1.5,18015.36,1480,12.17,16377.6,1882.4827586206898,8.6999999999999993,10.38,'Split_Wall_Mounted GENERAL GOLDIN 1.5TR SEER 10.38','Split_Wall_Mounted Mando 1.53TR SEER 10.38'),
('Split_Wall_Mounted','Platinum','PLS30-C','Inverter','2',2.2599999999999998,27200,2194,12.39,23600,2712.6436781609195,8.6999999999999993,10.48,'Split_Wall_Mounted Platinum 2.26TR SEER 10.48','Inverter unit "No replacement"'),
('Split_Wall_Mounted','ROLLC','RASN12HP','Non-Inverter','1',0.93,11259,1237.2527472527472,9.1,0,0,null,null,null,'Split_Wall_Mounted LG 0.95TR SEER 8.3'),
('Split_Wall_Mounted','FUJI','RSA18RAT','Non-Inverter','1.5',1.52,18300,2160,8.4700000000000006,15400,2421.383647798742,6.36,7.27,'Split_Wall_Mounted FUJI 1.52TR SEER 7.27','Split_Wall_Mounted LG 1.46TR SEER 7.28'),
('Split_Wall_Mounted','Rantic','Rtc24hn','Non-Inverter','1.5',1.71,20545,1739,11.81,17577,2104.5258620689656,8.3520000000000003,10,'Split_Wall_Mounted Rantic 1.71TR SEER 10','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','LG','s182hq','Non-Inverter','1.5',1.54,18500,1960,9.43,16787.04,2080,8.0706923076923083,8.43,'Split_Wall_Mounted LG 1.54TR SEER 8.43','Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','LG','S192LH','Non-Inverter','1.5',1.54,18500,1900,9.73,19000,2183.9080459770116,8.6999999999999993,8.91,'Split_Wall_Mounted LG 1.54TR SEER 8.91','Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','Haam','S-30H/Hr','Non-Inverter','2',1.99,23884,2930,8.15,21495.599999999999,3198.75,6.72,7.21,'Split_Wall_Mounted Haam 1.99TR SEER 7.21','Split_Wall_Mounted Zamil 2.11TR SEER7.24'),
('Split_Wall_Mounted','LG','S3824C Nvo','Non-Inverter','2.5',2.7,32482.239999999998,3820,8.5,28012.52,4599.7569786535305,6.09,7.23,'Split_Wall_Mounted LG 2.7TR SEER 7.23','Split_Wall_Mounted Carrier 2.75TR SEER 8.81'),
('Split_Wall_Mounted','LG','S382GQ S01','Non-Inverter','3',3.16,38000,3700,10.27,0,0,null,null,null,'No Equivalent Found provide Pic & Datasheets'),
('Split_Wall_Mounted','SAC','Sac18hc','Non-Inverter','1.5',1.5,18000,0,null,0,0,null,null,null,'Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','SREEN','SREEN24CS','Non-Inverter','1.5',1.78,21400,1761,12.15,18600,2175.4385964912281,8.5500000000000007,10.28,'Split_Wall_Mounted SREEN 1.78TR SEER 10.28','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','tcl','tac-12cs/et2','Non-Inverter','1',0.89,10768.271999999999,1299,8.2799999999999994,0,0,null,null,null,'Split_Wall_Mounted LG 0.95TR SEER 8.3'),
('Split_Wall_Mounted','TERIM','TRG30C717','Non-Inverter','2',2.27,27300,2310,11.81,23000,2705.0000000000005,8.502772643253234,10.039999999999999,'Split_Wall_Mounted TERIM 2.27TR SEER 10.04','Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','York','YE8SD240SCBC41- HB','Non-Inverter','2',1.83,22000,1800,12.22,18200,2128.6549707602339,8.5500000000000007,10.29,'Split_Wall_Mounted York 1.83TR SEER 10.29','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','York','YHGE18XT2BFE-R3','Non-Inverter','1.5',1.47,17700,1480,11.95,15200,1760,8.6363636363636367,10.18,'Split_Wall_Mounted York 1.47TR SEER 10.18','Split_Wall_Mounted General 1.5TR SEER 10.16'),
('Split_Wall_Mounted','York','YHGE30XT3CFE-R4','Non-Inverter','2',2.2599999999999998,27200,2210,12.3,23000,0,null,null,null,'Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','Samsung','AR18TQHQCWKX','Inverter','1.5',1.5,18000,1452,12.39,15900,1797,8.8480801335559267,10.54,'Split_Wall_Mounted Samsung 1.5TR SEER 10.54','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Samsung','AS24EAPX','Non-Inverter','2',2,24000,2750,8.7200000000000006,19841,3200,6.2003124999999999,7.38,'Split_Wall_Mounted Samsung 2TR SEER 7.38','Split_Wall_Mounted Zamil 1.83TR SEER 7.51'),
('Split_Wall_Mounted','SHARP','AU-A18WCS','Non-Inverter','1.5',1.5,18000,1481,12.15,15000,1754,8.5518814139110599,10.25,'Split_Wall_Mounted SHARP 1.5TR SEER 10.25','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','Craft','DSXSA24CE73H2','Non-Inverter','2',2,24000,2720,8.82,0,0,null,null,null,'Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','Ugine','KT3F-45W/J1','Non-Inverter','1.5',1.5,18000,0,null,0,0,null,null,null,'Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','LG','LS-D1821HM','Non-Inverter','1.5',1.5,18000,1800,10,0,0,null,null,null,'Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','Kelvinator','HSCU18HB','Non-Inverter','1.5',1.5,18000,2300,7.82,0,0,null,null,null,'Split_Wall_Mounted Royal Temp 1.5TR SEER 7.67'),
('Split_Wall_Mounted','Frego','FW24Y2M7','Non-Inverter','2',1.93,23202,2000,11.6,19899,2391.7067307692305,8.32,9.86,'Split_Wall_Mounted Frego 1.93TR SEER 9.86','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','DANSAT','DSA24WC','Non-Inverter','2',1.83,22000,1810,12.15,19000,1938.7755102040815,9.8000000000000007,10.65,'Split_Wall_Mounted DANSAT 1.83TR SEER 10.65','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Mando','MP-18HD','Non-Inverter','1.5',1.5,18000,1500,12,15600,1813.9999999999998,8.5997794928335178,10.199999999999999,'Split_Wall_Mounted Mando 1.5TR SEER 10.2','Split_Wall_Mounted Ugine 1.48TR SEER 10.23'),
('Split_Wall_Mounted','TIT','TAS-1815H6S-2','Non-Inverter','1.5',1.5,18000,1485,12.12,15600,1785.0000000000002,8.7394957983193269,10.32,'Split_Wall_Mounted TIT 1.5TR SEER 10.32','Split_Wall_Mounted Mando 1.5TR SEER 10.35'),
('Split_Wall_Mounted','CRONY','CRONY18CHL','Non-Inverter','1.5',1.49,17913,1480,12.1,15354,1780,8.6258426966292134,10.27,'Split_Wall_Mounted CRONY 1.49TR SEER 10.27','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','York','YORX-18KC','Non-Inverter','1.5',1.5,18000,1500,12,0,0,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Unistar','UNISTAR18SH','Non-Inverter','1.5',1.5,18000,1500,12,0,0,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','York','YK9FXH018BAH-AX','Non-Inverter','1.5',1.5,18000,1500,12,15500,0,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Luna','LAC-240KH','Non-Inverter','2',2,24000,2750,8.7200000000000006,0,0,null,null,null,'Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','Rantic','RTC18HN','Non-Inverter','1.5',1.43,17197,1431,12.01,14899,1703,8.7486788021139166,10.26,'Split_Wall_Mounted Rantic 1.43TR SEER 10.26','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','Giant','ASTW-H18B2/EV','Non-Inverter','1.5',1.5,18000,1940,9.27,16100,2370,6.7932489451476794,7.95,'Split_Wall_Mounted Giant 1.5TR SEER 7.95','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','Giant','ASTW-H12T2/ET-3','Non-Inverter','1',0.83,10000,1220,8.19,8750,1450,6.0344827586206895,7.02,'Split_Wall_Mounted Giant 0.83TR SEER 7.02','Split_Wall_Mounted LG 0.95TR SEER 7.9'),
('Split_Wall_Mounted','Queen','HOIT24H','Non-Inverter','1.5',1.71,20523.18,2208,9.2899999999999991,0,0,null,null,null,'Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','LG','S252LH','Non-Inverter','2',2.04,24500,2450,10,0,0,null,null,null,'Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','Fuji','ROW-24RSD.','Non-Inverter','1.5',1.62,19448.399999999998,2900,6.7,0,0,null,null,null,'Split_Wall_Mounted Gree 1.5TR SEER 7.03'),
('Split_Wall_Mounted','York','YHGE12YT2BFER-3','Non-Inverter','1',1,12000,985,12.18,10050,0,null,null,null,'Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Ugne','UGNE-P24C-D','Non-Inverter','2',1.84,22100,1811,12.2,18400,2152,8.5501858736059475,10.28,'Split_Wall_Mounted Ugne 1.84TR SEER 10.28','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Midea','MSTG-18HR','Non-Inverter','1.5',1.5,18000,2080,8.65,0,0,null,null,null,'Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','Arrow','MST2-30HR','Non-Inverter','2.5',2.5,30000,2670,11.23,0,0,null,null,null,'Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','LUNA','LAC-180HK','Non-Inverter','1.5',1.5,18000,2730,6.59,0,0,null,null,null,'Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','Mando','MP-18CDN','Non-Inverter','1.5',1.5,18000,1469,12.25,15200,1747.0000000000002,8.7006296508299936,10.37,'Split_Wall_Mounted Mando 1.5TR SEER 10.37','Split_Wall_Mounted Okia 1.53TR SEER 10.37'),
('Split_Wall_Mounted','Zamil','HAZ24CHXRDK','Non-Inverter','2',1.85,22200,1827,12.15,19100,2220.9302325581398,8.6,10.29,'Split_Wall_Mounted Zamil 1.85TR SEER 10.29','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Zamil','HWX26EHAYPS','Non-Inverter','2',2,24000,0,null,0,0,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 10.39'),
('Split_Wall_Mounted','Zamil','KXC24CSIHIST','Non-Inverter','2',2,24000,0,null,0,0,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 10.39'),
('Split_Wall_Mounted','zamil','HWX24EHAXH','Non-Inverter','2',2,24000,0,null,0,0,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 10.39'),
('Split_Wall_Mounted','Zamil','MWZ24CHIXFT','Non-Inverter','2',2,24000,0,null,0,0,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 10.39'),
('Split_Wall_Mounted','Zamil','CXC24C1HV8','Non-Inverter','2',2,24000,0,null,0,0,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 10.39'),
('Split_Wall_Mounted','LG','A122NC','Non-Inverter','1',0.97,11737.28,1020,11.5,10021.044,0,null,null,null,'Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Zamil','KXC26CSRHAPS','Non-Inverter','2',2,24000,0,null,0,0,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 10.39'),
('Split_Wall_Mounted','LG','LST24CAG','Non-Inverter','2',2,24000,2308,10.39,0,0,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 10.39'),
('Split_Wall_Mounted','Haier','HSU-24LNX13','Non-Inverter','2',1.83,22000,1795,12.25,19000,2222,8.5508550855085517,10.34,'Split_Wall_Mounted Haier 1.83TR SEER 10.34','Split_Wall_Mounted Crown 1.79TR SEER 10.33'),
('Split_Wall_Mounted','Samsung','ASH-2407BRX','Non-Inverter','2',1.83,22000,2700,8.14,0,0,null,null,null,'Split_Wall_Mounted LG 1.74TR SEER 8.17'),
('Split_Wall_Mounted','Samsung','AR18MQFHCWKN','Non-Inverter','1.5',1.45,17500,1500,11.66,15000,0,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Gree','GWH12MB-D1NTA3A/O','Non-Inverter','1',1,12000,1300,9.23,10200,1550,6.580645161290323,7.82,'Split_Wall_Mounted Gree 1TR SEER 7.82','Split_Wall_Mounted LG 0.95TR SEER 7.9'),
('Split_Wall_Mounted','Midea','MSTG-30HR-I9','Non-Inverter','2.5',2.5,30000,3296.7032967032969,9.1,0,0,null,null,null,'Split_Wall_Mounted Carrier 2.75TR SEER 8.81'),
('Split_Wall_Mounted','Midea','MSTEP','Non-Inverter','1.5',1.71,20545,1739,11.81,17577,2150,8.1753488372093024,9.94,'Split_Wall_Mounted Midea 1.71TR SEER 9.94','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Midea','MSTE24CRNB2','Non-Inverter','2',1.95,23400,1900,12.31,19900,2280,8.7280701754385959,10.42,'Split_Wall_Mounted Midea 1.95TR SEER 10.42','Split_Wall_Mounted Zamil 1.83TR SEER 10.42'),
('Split_Wall_Mounted','Midea','MSTEP12HRN6','Non-Inverter','1',0.96,11529,983,11.72,9535,1125,8.4755555555555553,9.9600000000000009,'Split_Wall_Mounted Midea 0.96TR SEER 9.96','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Ugine','UTS18USH','Non-Inverter','1.5',1.5,18000,2250,8,0,0,null,null,null,'Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','Ugine','UGNCC-24H7','Non-Inverter','2',1.99,23900,1960,12.19,20300,2350,8.6382978723404253,10.32,'Split_Wall_Mounted Ugine 1.99TR SEER 10.32','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','GENERAL PLUS','GENP24CRS','Non-Inverter','2',1.8,21600,1800,12,18400,2200,8.3636363636363633,10.11,'Split_Wall_Mounted GENERAL PLUS 1.8TR SEER 10.11','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','Kelvinator','GQR183MIO-M0','Non-Inverter','1.5',1.54,18500,0,null,0,0,null,null,null,'Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','GREE','GWH24MD-D1NTA8G/I','Non-Inverter','2',1.83,22000,0,null,0,0,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','GREE','GWC18AGDXF-D3NTA1F/0','Inverter','1.5',1.54,18500,1492,12.39,0,0,null,null,null,'Inverter unit "No replacement"'),
('Split_Wall_Mounted','GENERAL PLUS','GENPL24C','Non-Inverter','1.5',1.5,18000,0,null,0,0,null,null,null,'Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','FALCON','HNFC26HW-BG','Non-Inverter','2',2,24000,2880,8.33,0,0,null,null,null,'Split_Wall_Mounted Zamil 1.95TR SEER 8.11'),
('Split_Wall_Mounted','Unionaire','HWC024U6HO','Non-Inverter','2',1.96,23600,2472,9.5399999999999991,0,0,null,null,null,'Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','Fuji','RYT-24RSA','Non-Inverter','1.5',1.5,18083.599999999999,3000,6.02,0,0,null,null,null,'Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','Haam','S-036C/hr','Non-Inverter','2.5',2.4300000000000002,29162,3480,8.3699999999999992,24548,3800,6.46,7.25,'Split_Wall_Mounted Haam 2.43TR SEER 7.25','Split_Wall_Mounted LG 2.25TR SEER 7.28'),
('Split_Wall_Mounted','TACHIAIR','TCH30H/7S16','Non-Inverter','2',2,24000,2080,11.53,20500,2380,8.6134453781512601,9.91,'Split_Wall_Mounted TACHIAIR 2TR SEER 9.91','Split_Wall_Mounted Carrier 1.92TR SEER 9.83'),
('Split_Wall_Mounted','HAAS','HSA18CE6HGRC','Non-Inverter','1.5',1.5,18083,2250,8.0299999999999994,16200,2550,6.3529411764705879,7.03,'Split_Wall_Mounted HAAS 1.5TR SEER 7.03','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','Lakes','LSAC-18H/A','Non-Inverter','1.5',1.4,16877.7,1890,8.93,14957.7,2190,6.83,7.74,'Split_Wall_Mounted Lakes 1.4TR SEER 7.74','Split_Wall_Mounted Royal Temp 1.5TR SEER 7.67'),
('Split_Wall_Mounted','Daikin','RY60GVAL','Non-Inverter','2',2,24000,2610,9.19,0,0,null,null,null,'Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','Daikin','RY50GVAL','Non-Inverter','1.5',1.64,19789.599999999999,0,null,0,0,null,null,null,'Split_Wall_Mounted Gree 1.5TR SEER 7.03'),
('Split_Wall_Mounted','SPEEDCOOL','SKTS240H','Inverter','2',1.8,21600,1742,12.39,0,0,null,null,null,'Inverter unit "No replacement"'),
('Split_Wall_Mounted','SPEEDCOOL','ASC-18','Non-Inverter','1.5',1.5,18000,2100,8.57,0,0,null,null,null,'Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','SPEEDCOOL','SCIT18H','Non-Inverter','1.5',1.41,16978.112000000001,2040,8.32,14593.124,2409,6.0577517642175174,7.1,'Split_Wall_Mounted SPEEDCOOL 1.41TR SEER 7.1','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','TRIM','TRG12717OD','Non-Inverter','1',0.95,11500,970,11.85,10200,1193,8.5498742665549035,10.119999999999999,'Split_Wall_Mounted TRIM 0.95TR SEER 10.12','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Coolsense','AAMJCSP18SAC','Non-Inverter','1.5',1.5,18000,1480,12.16,16400,0,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Tcl','TAC-18CHS/MT2','Non-Inverter','1.5',1.5,18000,2000,9,0,0,null,null,null,'Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','TCL','TAC-18CHS/ET2','Non-Inverter','1.5',1.33,16000,1900,8.42,0,0,null,null,null,'Split_Wall_Mounted LG 1.46TR SEER 7.57'),
('Split_Wall_Mounted','Luna','LAC-180KHF','Non-Inverter','1.5',1.5,18000,2400,7.5,0,0,null,null,null,'Split_Wall_Mounted LG 1.46TR SEER 7.56'),
('Split_Wall_Mounted','Class pro','CLS18H8SEC','Non-Inverter','1.5',1.48,17800,1460,12.19,15400,0,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','SKM','FZW-020HP','Non-Inverter','1.5',1.52,18300,0,null,0,0,null,null,null,'Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','AUX','AUX24CHD','Inverter','2',2,24000,1930,12.43,20000,2285.7142857142858,8.75,10.49,'Split_Wall_Mounted AUX 2TR SEER 10.49','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Craft','SXSA18CF73H','Non-Inverter','1.5',1.5,18000,0,null,0,0,null,null,null,'Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','WBOX','WBAC18IH','Non-Inverter','1.5',1.44,17300,1450,11.93,14700,1710.0000000000002,8.5964912280701746,10.14,'Split_Wall_Mounted WBOX 1.44TR SEER 10.14','Split_Wall_Mounted LG 1.47TR SEER 10.15'),
('Split_Wall_Mounted','Arrow','RO-18SMC','Non-Inverter','1.5',1.5,18000,1469,12.25,15200,1747.0000000000002,8.7006296508299936,10.37,'Split_Wall_Mounted Arrow 1.5TR SEER 10.37','Split_Wall_Mounted Okia 1.53TR SEER 10.37'),
('Split_Wall_Mounted','UNIX','MUNIXSp-24CN','Non-Inverter','1.5',1.79,21500,1820,11.81,18300,2180,8.3944954128440372,10.01,'Split_Wall_Mounted UNIX 1.79TR SEER 10.01','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','Comfort','MSAC-30CHS/GT7','Non-Inverter','2',2.04,24500,2110,11.61,0,0,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 10.39'),
('Split_Wall_Mounted','Super_General','KSGS241GER','Non-Inverter','1.5',1.75,21000,1721,12.2,19200,2207,8.6995922066153142,10.4,'Split_Wall_Mounted Super_General 1.75TR SEER 10.4','Split_Wall_Mounted Arrow 1.75TR SEER 10.39'),
('Split_Floor_Standing','Ugine','KT3FR-120W/lE','Non-Inverter','3.5',3.41,41025.641025641024,4990,8.2200000000000006,0,0,null,null,null,'Split_Floor_Standing Zamil 3.42TR SEER 6.87'),
('Split_Ceiling_Cassette','LG','ATU1W18GPL','Non-Inverter','1.5',1.49,17981.239999999998,1550,11.6,15456.359999999999,1710.0000000000002,9.0388070175438582,10.08,'Split_Ceiling_Cassette LG 1.49TR SEER 10.08','Split_Ceiling_Cassette LG 1.5TR SEER 8.05'),
('Split_Ceiling_Cassette','Gree','gutd24w4/a-s','Non-Inverter','2',2,24000,0,null,0,0,null,null,null,'Split_Ceiling_Cassette Mitsubishi 2.02TR SEER 6.93'),
('Split_Ceiling_Cassette','Carrier','38DPJ024-323F-C','Non-Inverter','2',2,24000,2900,8.27,0,0,null,null,null,'Split_Ceiling_Cassette LG 1.99TR SEER 8.23'),
('Split_Ceiling_Cassette','Royal_Temp','RT Casette','Non-Inverter','2',2,24000,0,null,0,0,null,null,null,'Split_Ceiling_Cassette Mitsubishi 2.02TR SEER 6.93'),
('Split_Ceiling_Cassette','Gree','GUTD36W/A','Non-Inverter','3',3,36000,0,null,0,0,null,null,null,'Split_Ceiling_Cassette Carrier 2.88TR SEER 10.05'),
('Split_Ceiling_Cassette','Zamil','KXC24CSIHAAW','Non-Inverter','2',2,24000,0,null,0,0,null,null,null,'Split_Ceiling_Cassette Mitsubishi 2.02TR SEER 6.93'),
('Split_Ceiling_Cassette','Carrier','38CK048-X-3A1','Non-Inverter','4',4,48000,0,null,0,0,null,null,null,'Split_Ceiling_Cassette LG 4.21TR SEER 7.69'),
('Split_Ceiling_Cassette','General','AOS25R2AL','Non-Inverter','1.5',1.59,19107.199999999997,2250,8.49,0,0,null,null,null,'Split_Ceiling_Cassette LG 1.5TR SEER 8.05'),
('Window','Zamil','HHB24CKERIMNW','Non-Inverter','2',1.85,22250,2602,8.5500000000000007,18500,3008,6.1502659574468082,7.25,'Window Zamil 1.85TR SEER 7.25','Window Zamil 2TR SEER 7.24'),
('Window','Zamil','ZHB24CPEQIMNW','Non-Inverter','1.5',1.79,21500,2870,7.49,18000,3300,5.4545454545454541,6.37,'Window Zamil 1.79TR SEER 6.37','Window Zamil 1.79TR SEER 6.38'),
('Window','Haam','HW18E3WC','Non-Inverter','1.5',1.5,18000,null,null,null,null,null,6.72,'Window Haam 1.5TR SEER 6.72','Window Zamil 1.5TR SEER 6.51'),
('Window','White Westinghouse','WGS-240-C/H','Non-Inverter','2',2,24000,null,null,null,null,null,6.4,'Window White Westinghouse 2TR SEER 6.4','Window  Zamil 2TR SEER 6.23'),
('Window','Craft','DE24E8JT41','Non-Inverter','2',2.0099999999999998,24200,null,null,null,null,null,7.67,'Window Craft 2.01TR SEER 7.67','Window Carrier 2.01TR SEER 7.59'),
('Window','Falcon','FSSR243M-0G8','Non-Inverter','1.5',1.75,21000,null,null,null,null,null,8.4499999999999993,'Window Falcon 1.75TR SEER 8.45','Window York  1.75TR SEER 8.45'),
('Window','Haam','HMVD183M-5B-17','Non-Inverter','1.5',1.5,18100,null,null,null,null,null,8.25,'Window Haam 1.5TR SEER 8.25','Window Zamil 1.5TR SEER 6.51'),
('Window','Kelvinator','KSSD183M-0K8','Non-Inverter','1.5',1.48,17800,null,null,null,null,null,8.3699999999999992,'Window Kelvinator 1.48TR SEER 8.37','Window Zamil 1.5TR SEER 6.51'),
('Window','LG','W242SR SN0 /GWH242NAMM0','Non-Inverter','2',2,24000,null,null,null,null,null,7.25,'Window LG 2TR SEER 7.25','Window Zamil 2TR SEER 7.24'),
('Split_Wall_Mounted','Midea','MSTM18HRN2/MSTM18HRN2','Non-Inverter','1.5',1.54,18500,null,null,null,null,null,10.050000000000001,'Split_Wall_Mounted Midea 1.54TR SEER 10.05','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Window','National','W18CTM','Non-Inverter','1.5',1.47,17640,null,null,null,null,null,null,null,'Window Carrier 1.43TR SEER 8.52'),
('Window','Starway','WYR18KHC','Non-Inverter','1.5',1.45,17400,null,null,null,null,null,8.44,'Window Starway 1.45TR SEER 8.44','Window Carrier 1.43TR SEER 8.52'),
('Window','Toshiba','RAC-24B-Q','Non-Inverter','2',1.83,22000,null,null,null,null,null,7.26,'Window Toshiba 1.83TR SEER 7.26','Window Zamil 2TR SEER 7.24'),
('Window',' York ','LYSD243M-0C8','Non-Inverter','2',2.0099999999999998,24200,2674,9.0500000000000007,18700,2968,6.3005390835579513,7.57,'Window  York  2.01TR SEER 7.57','Window Zamil 2TR SEER 7.24'),
('Window',' York ','LYSD243M-0B5','Non-Inverter','2',2,24050,2813,8.5399999999999991,18970,3089,6.141146001942376,7.22,'Window  York  2TR SEER 7.22','Window Zamil 2TR SEER 7.24'),
('Window',' Zamil','YHB1BCTEYIINW','Non-Inverter','1.5',1.5,18000,null,null,null,null,null,6.8,'Window  Zamil 1.5TR SEER 6.8','Window Samsung 1.5TR SEER 6.82'),
('Window',' Zamil','HHB19CKERIMNW','Non-Inverter','1.5',1.58,19000,null,null,null,null,null,7.21,'Window  Zamil 1.58TR SEER 7.21','Window LG 1.49TR SEER 7.24'),
('Window',' Zamil','AHM24CEBW','Non-Inverter','2',2,24000,null,null,null,null,null,7.04,'Window  Zamil 2TR SEER 7.04','Window Zamil 2TR SEER 7.24'),
('Window','Craft','D024E8H5Y','Non-Inverter','2',2,24005,2805,8.5500000000000007,20499.289166903611,3345,6.1283375685810499,7.26,'Window Craft 2TR SEER 7.26','Window Zamil 2TR SEER 7.24'),
('Window','Kelvinator','KSVR243M-1','Non-Inverter','2',2,24000,2700,8.8800000000000008,18493.033835655388,3100,5.9654947856952862,7.36,'Window Kelvinator 2TR SEER 7.36','Window  Zamil 2TR SEER 7.33'),
('Window','Haas','H024E8H5YX','Non-Inverter','2',2,24000,2805,8.5500000000000007,20499.289166903611,3345,6.1283375685810499,7.26,'Window Haas 2TR SEER 7.26','Window Zamil 2TR SEER 7.24'),
('Window','Haas','HO125E8Y','Non-Inverter','2',1.83,22000,2155,10.199999999999999,18500,2570,7.1984435797665371,8.6199999999999992,'Window Haas 1.83TR SEER 8.62','Window York  1.75TR SEER 8.45'),
('Window','Fisher','FWAC-T18CE','Non-Inverter','1.5',1.41,17000,1650,10.3,13700,1943,7.0509521358723619,8.6,'Window Fisher 1.41TR SEER 8.6','Window Carrier 1.5TR SEER 8.62'),
('Window','Zamil','ACB24CTEAIMNW','Non-Inverter','2',2,24000,2740,8.75,18000,3200,5.625,7.15,'Window Zamil 2TR SEER 7.15','Window Zamil 2TR SEER 7.20'),
('Window','Zamil','AHM24CEA','Non-Inverter','2',2,24000,2800,8.57,18000,3500,5.1428571428571432,6.86,'Window Zamil 2TR SEER 6.86','Window  Zamil 2TR SEER 6.95'),
('Window','LG','E182BH SN0','Non-Inverter','1.5',1.48,17878.874040375322,1820,9.82,15353.994882001707,2170,7.0755736783418008,8.35,'Window LG 1.48TR SEER 8.35','Window Carrier 1.43TR SEER 8.52'),
('Window','Gibson','AE24E6H5JN','Non-Inverter','2',2.02,24300,2820,8.61,19500,3180,6.132075471698113,7.26,'Window Gibson 2.02TR SEER 7.26','Window Zamil 1.88TR SEER 7.28'),
('Window','Zamil','AHM24CEB','Non-Inverter','2',2,24000,2300,10.43,18000,3200,5.625,8.09,'Window Zamil 2TR SEER 8.09','Window LG 2TR SEER 7.48'),
('Window','Carrier','51GVR243M 1S','Non-Inverter','2',1.83,22000,2430,9.0500000000000007,18970.713676428775,3000,6.3235712254762584,7.63,'Window Carrier 1.83TR SEER 7.63','Window LG 2TR SEER 7.48'),
('Window','York','NYVD183M-0C','Non-Inverter','1.5',1.5,18000,2200,8.18,14978.675007108332,2500,5.9914700028433323,6.97,'Window York 1.5TR SEER 6.97','Window  Zamil 1.5TR SEER 6.92'),
('Window','Zamil','AHB26CHELKINW','Non-Inverter','2',2,24000,2810,8.5399999999999991,18000,3120,5.7692307692307692,7.07,'Window Zamil 2TR SEER 7.07','Window Zamil 2TR SEER 7.10'),
('Window','Super_General','KSGA24GE','Non-Inverter','1.5',1.66,20000,1942,10.29,16100,2284,7.0490367775831873,8.6,'Window Super_General 1.66TR SEER 8.6','Window York  1.75TR SEER 8.45'),
('Window','TCL','CW-TW18CW1','Non-Inverter','1.5',1.5,18000,1800,10,15200,2156,7.050092764378479,8.44,'Window TCL 1.5TR SEER 8.44','Window Carrier 1.43TR SEER 8.52'),
('Window','Frego','FT18E2H9','Non-Inverter','1.5',1.45,17500,1710,10.23,14500,2040,7.1078431372549016,8.59,'Window Frego 1.45TR SEER 8.59','Window Carrier 1.5TR SEER 8.62'),
('Window','Gree','GJC24AE-D3NMTD5D','Non-Inverter','2',1.81,21800,2150,10.130000000000001,18300,2550,7.1764705882352944,8.57,'Window Gree 1.81TR SEER 8.57','Window York  1.75TR SEER 8.45'),
('Window','Zamil','AHM18CEA','Non-Inverter','1.5',1.5,18000,2100,8.57,15000,2400,6.25,7.29,'Window Zamil 1.5TR SEER 7.29','Window LG 1.49TR SEER 7.24'),
('Window','Ugine','UGNW18C-5','Non-Inverter','1.5',1.48,17800,1787,9.9600000000000009,15000,2117,7.0854983467170527,8.43,'Window Ugine 1.48TR SEER 8.43','Window Carrier 1.43TR SEER 8.52'),
('Window','General','ANJ24BDG1R','Non-Inverter','2',2,24050,2813,8.5399999999999991,20000,3268,6.119951040391677,7.24,'Window General 2TR SEER 7.24','Window Zamil 2TR SEER 7.24'),
('Window','Carrier','C2K5G-18HK5','Non-Inverter','1.5',1.5,18000,2300,7.82,14193.915268694911,2750,5.1614237340708771,6.46,'Window Carrier 1.5TR SEER 6.46','Window Zamil 1.5TR SEER 6.51'),
('Window','Zamil','AHB19CIEPIMNW','Non-Inverter','1.5',1.54,18500,2260,8.18,14000,2510,5.5776892430278888,6.8,'Window Zamil 1.54TR SEER 6.8','Window  Zamil 1.5TR SEER 6.80'),
('Window','Carrier','CACH24','Non-Inverter','2',2,24000,2970,8.08,18697.753767415412,3500,5.3422153621186892,6.67,'Window Carrier 2TR SEER 6.67','Window Royal Temp 2TR SEER 6.41'),
('Window','Carrier','C2K18HK5','Non-Inverter','1.5',1.5,18000,2450,7.34,14630,2750,5.32,6.23,'Window Carrier 1.5TR SEER 6.23','Window Zamil 1.5TR SEER 6.51'),
('Window','Carrier','51GVD3324-3','Non-Inverter','2',2,24000,3400,7.05,18493.033835655388,3770,4.9053140147627019,5.9,'Window Carrier 2TR SEER 5.9','Window  Zamil 2TR SEER 6.23'),
('Split_Floor_Standing','Gree','KT3F-120LW/E','Non-Inverter','4',4,48000,null,null,null,null,null,null,null,'Split_Floor_Standing LG 4.35TR SEER 7.05'),
('Split_Floor_Standing','Samsung','AP55M2AN','Non-Inverter','4',4.16,50000,null,null,null,null,null,7.84,'Split_Floor_Standing Samsung 4.16TR SEER 7.84','Split_Floor_Standing LG 4.35TR SEER 7.05'),
('Split_Floor_Standing','Rheem','RFS48CMTSCR1','Non-Inverter','4',3.85,46200,null,null,null,null,null,9.91,'Split_Floor_Standing Rheem 3.85TR SEER 9.91','Split_Floor_Standing LG 3.75TR SEER 7.47'),
('Split_Floor_Standing','Samsung','AP55Q0DN','Non-Inverter','4.5',4.33,52000,null,null,null,null,null,8.23,'Split_Floor_Standing Samsung 4.33TR SEER 8.23','Split_Floor_Standing LG 4.35TR SEER 7.05'),
('Split_Floor_Standing','LG','LP-C552TM3','Non-Inverter','3',3.15,37873.187375604211,4100,9.23,32072.789309070235,4800,6.6818311060562987,7.86,'Split_Floor_Standing LG 3.15TR SEER 7.86','Split_Floor_Standing LG 3.15TR SEER 7.86'),
('Split_Floor_Standing','Winner','FS-050CHR','Non-Inverter','4',3.83,46061.984646005119,5470,8.42,42308.785897071371,6380,6.6314711437415941,7.37,'Split_Floor_Standing Winner 3.83TR SEER 7.37','Split_Floor_Standing LG 3.75TR SEER 7.47'),
('Split_Floor_Standing','LG','LP-C552TE2','Non-Inverter','3.5',3.32,39920.386693204433,4690,8.51,33096.388967870342,5400,6.1289609199759889,7.22,'Split_Floor_Standing LG 3.32TR SEER 7.22','Split_Floor_Standing LG 3.32TR SEER 7.22'),
('Split_Floor_Standing','Ugine','UGNFL-60C7','Non-Inverter','5.5',4.3499999999999996,52200,4410,11.83,48500,5470,8.8665447897623402,10.24,'Split_Floor_Standing Ugine 4.35TR SEER 10.24','Split_Floor_Standing Samsung 4TR SEER 10.3'),
('Split_Floor_Standing','Carrier','42HD7B / 38CKC060','Non-Inverter','5',5,60000,5600,10.71,0,0,null,null,'Split_Floor_Standing Carrier 5TR SEER -','Split_Floor_Standing LG 4.5TR SEER 10.00'),
('Split_Floor_Standing','Carrier','42HD6B / 38CKC048','Non-Inverter','4',4,48000,8251,5.81,0,0,null,null,'Split_Floor_Standing Carrier 4TR SEER -','Split_Floor_Standing LG 4.35TR SEER 7.05'),
('Split_Floor_Standing','LG','LP-H552TM2','Non-Inverter','3.5',3.72,44697.185100938303,4930,9.06,37531.987489337509,5860,6.4047760220712471,7.65,'Split_Floor_Standing LG 3.72TR SEER 7.65','Split_Floor_Standing LG 3.72TR SEER 7.65'),
('Split_Floor_Standing','Century','KPC-48/7S','Non-Inverter','3',3.01,36167.187944270685,3137,11.52,32413.989195336937,3900,8.3112792808556257,9.84,'Split_Floor_Standing Century 3.01TR SEER 9.84','Split_Floor_Standing Daewoo 3.16TR SEER 8.11'),
('Split_Floor_Standing','LG','LP-C552TE1','Non-Inverter','5',4.58,55000,4200,13.09,0,0,null,null,'Split_Floor_Standing LG 4.58TR SEER -','Split_Floor_Standing Zamil 4.421TR SEER 10.15'),
('Split_Floor_Standing','Awalgulf','EQ048SCAC','Non-Inverter','4',4,48000,6380,7.52,41280,6440,6.4099378881987574,6.68,'Split_Floor_Standing Awalgulf 4TR SEER 6.68','Split_Floor_Standing LG 4.35TR SEER 7.05'),
('Split_Floor_Standing','York','YE8FT55SH7AC41','Non-Inverter','4.5',4.25,51000,4322,11.8,45000,5357,8.4002240059734934,10.029999999999999,'Split_Floor_Standing York 4.25TR SEER 10.03','Split_Floor_Standing LG 4.5TR SEER 10.00'),
('Split_Ceiling_Cassette','York','YE3CJ24SC7AC22','Non-Inverter','3',2,24000,3190,7.52,20640,3800,5.4315789473684211,6.41,'Split_Ceiling_Cassette York 2TR SEER 6.41','Split_Ceiling_Cassette Mitsubishi 2.02TR SEER 6.93'),
('Split_Ceiling_Cassette','Samsung','AF55MV1MAEEN','Non-Inverter','4',4,48000,4050,11.85,42000,4920,8.536585365853659,10.1,'Split_Ceiling_Cassette Samsung 4TR SEER 10.1','Split_Ceiling_Cassette LG 3.83TR SEER 9.87'),
('Split_Ceiling_Cassette','Sky star','C-24C','Non-Inverter','3',2,24000,2030,11.82,20000,2350,8.5106382978723403,10.029999999999999,'Split_Ceiling_Cassette Sky star 2TR SEER 10.03','Split_Ceiling_Cassette Carrier 1.96TR SEER 10.25'),
('Split_Ceiling_Cassette','York','YE7CT24SH7AC41','Non-Inverter','3',1.85,22200,1914,11.59,20000,2381,8.3998320033599327,9.92,'Split_Ceiling_Cassette York 1.85TR SEER 9.92','Split_Ceiling_Cassette Carrier 1.96TR SEER 10.25'),
('Split_Ceiling_Cassette','York','YE3CM30SC7AC22','Non-Inverter','2.5',2.5,30000,3990,7.51,25800,4770,5.4088050314465406,6.39,'Split_Ceiling_Cassette York 2.5TR SEER 6.39','Split_Ceiling_Cassette LG 2.31TR SEER 7.39'),
('Split_Ceiling_Cassette','Craft','DS24FE7HY7KM','Non-Inverter','2',1.93,23200,1933,12,20000,2353,8.4997875053123675,10.17,'Split_Ceiling_Cassette Craft 1.93TR SEER 10.17','Split_Ceiling_Cassette Carrier 1.96TR SEER 10.25'),
('Split_Ceiling_Cassette','York','YE3SD240SCAW22','Non-Inverter','2',2,24000,3190,7.52,20640,3810,5.4173228346456694,6.4,'Split_Ceiling_Cassette York 2TR SEER 6.4','Split_Ceiling_Cassette Mitsubishi 2.02TR SEER 6.93'),
('Split_Ceiling_Cassette','Craft','DS36FE7HS7KM2','Non-Inverter','2.5',2.7,32400,2655,12.2,27000,3175,8.5039370078740166,10.27,'Split_Ceiling_Cassette Craft 2.7TR SEER 10.27','Split_Ceiling_Cassette Carrier 2.88TR SEER 10.05')
on conflict (equipment_type, model_no) do update set
  make = excluded.make,
  compressor_type = excluded.compressor_type,
  size_category = excluded.size_category,
  tr = excluded.tr,
  t1_btu = excluded.t1_btu,
  t1_w = excluded.t1_w,
  t1_eer = excluded.t1_eer,
  t3_btu = excluded.t3_btu,
  t3_w = excluded.t3_w,
  t3_eer = excluded.t3_eer,
  equivalent_seer = excluded.equivalent_seer,
  surveyed_unit_description = excluded.surveyed_unit_description,
  equivalent_ac_model_description = excluded.equivalent_ac_model_description
where (t.make, t.compressor_type, t.size_category, t.tr, t.t1_btu, t.t1_w, t.t1_eer, t.t3_btu, t.t3_w, t.t3_eer, t.equivalent_seer, t.surveyed_unit_description, t.equivalent_ac_model_description)
   is distinct from (excluded.make, excluded.compressor_type, excluded.size_category, excluded.tr, excluded.t1_btu, excluded.t1_w, excluded.t1_eer, excluded.t3_btu, excluded.t3_w, excluded.t3_eer, excluded.equivalent_seer, excluded.surveyed_unit_description, excluded.equivalent_ac_model_description);

-- >>> CHUNK 7/11 — old_model_registry rows 1201-1400 of 1516
insert into public.old_model_registry as t (equipment_type, make, model_no, compressor_type, size_category, tr, t1_btu, t1_w, t1_eer, t3_btu, t3_w, t3_eer, equivalent_seer, surveyed_unit_description, equivalent_ac_model_description) values
('Split_Ceiling_Cassette','York','YE8CT24SH7AC41','Non-Inverter','2',1.85,22200,1850,12,19600,2306,8.4995663486556801,10.18,'Split_Ceiling_Cassette York 1.85TR SEER 10.18','Split_Ceiling_Cassette Carrier 1.96TR SEER 10.25'),
('Split_Ceiling_Cassette','GREE','GUD18T/A1-S(S)','Non-Inverter','1.5',1.51,18200,1515,12.01,16800,2000,8.4,10.19,'Split_Ceiling_Cassette GREE 1.51TR SEER 10.19','Split_Ceiling_Cassette LG 1.5TR SEER 8.05'),
('Split_Ceiling_Cassette','York','YE6CT18SC7BC41','Non-Inverter','1.5',1.42,17100,1482,11.53,15390,1852,8.3099352051835851,9.85,'Split_Ceiling_Cassette York 1.42TR SEER 9.85','Split_Ceiling_Cassette Carrier 1.33TR SEER 10.51'),
('Split_Ceiling_Cassette','Midea','MCCTV30HRN2','Inverter','2',2.25,27000,2160,12.5,24200,2750,8.8000000000000007,10.6,'Split_Ceiling_Cassette Midea 2.25TR SEER 10.6','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Craft','DSA25CE7GR7','Non-Inverter','2',1.87,22500,null,null,null,null,null,10.06,'Split_Wall_Mounted Craft 1.87TR SEER 10.06','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','General','AWS18ABAJ','Non-Inverter','1.5',1.3,15695,null,null,null,null,null,null,null,'Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','General','ASSA24RAT','Non-Inverter','2',1.88,22600,null,null,null,null,null,7.71,'Split_Wall_Mounted General 1.88TR SEER 7.71','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','General','ASS30ABAJ','Non-Inverter','2',1.91,23001,null,null,null,null,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Haam','HM30C/7S17','Non-Inverter','2',1.89,22770,null,null,null,null,null,9.8800000000000008,'Split_Wall_Mounted Haam 1.89TR SEER 9.88','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','LG','T182NC / LSNQ182CNC0','Non-Inverter','1.5',1.47,17742,null,null,null,null,null,9.86,'Split_Wall_Mounted LG 1.47TR SEER 9.86','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','LG','S242NH / GSNH2425NB2','Non-Inverter','2',1.91,22996,null,null,null,null,null,7.54,'Split_Wall_Mounted LG 1.91TR SEER 7.54','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','LG','S3220C','Non-Inverter','2.5',2.66,32000,null,null,null,null,null,null,null,'Split_Wall_Mounted Royal Temp 2.67TR SEER 7.44'),
('Split_Wall_Mounted','Samsung','AS24UUPX','Non-Inverter','2',2,24000,null,null,null,null,null,7.37,'Split_Wall_Mounted Samsung 2TR SEER 7.37','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Samsung','UST24A6RB','Non-Inverter','2',2,24000,null,null,null,null,null,7.87,'Split_Wall_Mounted Samsung 2TR SEER 7.87','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Zamil','YMCVD0304M','Non-Inverter','2',1.98,23799,null,null,null,null,null,8.14,'Split_Wall_Mounted Zamil 1.98TR SEER 8.14','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','LG','T3224H','Non-Inverter','2',2.33,27978.390673869773,2320,12.05,24600.511799829401,2650,9.2832119999356237,10.46,'Split_Wall_Mounted LG 2.33TR SEER 10.46','Split_Wall_Mounted LG 2.33TR SEER 10.46'),
('Split_Wall_Mounted','LG','Y242NH','Non-Inverter','1.5',1.74,20949.673016775661,2200,9.52,18254.193915268694,2550,7.1585074177524293,8.1999999999999993,'Split_Wall_Mounted LG 1.74TR SEER 8.2','Split_Wall_Mounted LG 1.74TR SEER 8.20'),
('Split_Wall_Mounted','Craft','DSW30FE7HY7M','Non-Inverter','2',2.37,28500,2342,12.16,23870.344043218654,2790,8.5556788685371519,10.26,'Split_Wall_Mounted Craft 2.37TR SEER 10.26','Split_Wall_Mounted Carrier 2.25TR SEER 10.20'),
('Split_Wall_Mounted','Haas','HSA25FE6HH7X','Non-Inverter','2',1.91,23000,1925,11.94,19800,2290,8.6462882096069862,10.17,'Split_Wall_Mounted Haas 1.91TR SEER 10.17','Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','Samsung','AQ24FCN','Non-Inverter','2',2,24000,2650,9.0500000000000007,19828.349999999999,3100,6.3962419354838707,7.64,'Split_Wall_Mounted Samsung 2TR SEER 7.64','Split_Wall_Mounted Royal Temp 2TR SEER 7.64'),
('Split_Wall_Mounted','Yoko','YOKO-36FCH','Non-Inverter','2.5',2.5299999999999998,30400,2500,12.16,26000,3000,8.6666666666666661,10.31,'Split_Wall_Mounted Yoko 2.53TR SEER 10.31','Split_Wall_Mounted Carrier 2.58TR SEER 10.41'),
('Split_Wall_Mounted','York','YE3SD30RSHYW22','Non-Inverter','2.5',2.5,30000,3990,7.51,25800,4750,5.4315789473684211,6.4,'Split_Wall_Mounted York 2.5TR SEER 6.4','Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Wall_Mounted','LG','T3624C','Non-Inverter','2.5',2.58,31015.069661643443,2710,11.44,24805.231731589425,2960,8.3801458552666972,9.7200000000000006,'Split_Wall_Mounted LG 2.58TR SEER 9.72','Split_Wall_Mounted LG 2.58TR SEER 9.72'),
('Split_Wall_Mounted','Falcon','FSEH24','Non-Inverter','2',2,24000,2970,8.08,18697.753767415412,3500,5.3422153621186892,6.66,'Split_Wall_Mounted Falcon 2TR SEER 6.66','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','LG','T3624H','Non-Inverter','2.5',2.58,31015.069661643443,2720,11.4,24771.111742962756,2920,8.4832574462201222,9.7200000000000006,'Split_Wall_Mounted LG 2.58TR SEER 9.72','Split_Wall_Mounted LG 2.58TR SEER 9.73'),
('Split_Wall_Mounted','Mando','AC-24H-MDE','Non-Inverter','2',1.93,23202,2000,11.6,19899,2390,8.325941422594143,9.85,'Split_Wall_Mounted Mando 1.93TR SEER 9.85','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Ugine','UGNE-P30CH-DN','Non-Inverter','2',2.23,26800,2197,12.19,22600,2613,8.6490623804056632,10.31,'Split_Wall_Mounted Ugine 2.23TR SEER 10.31','Split_Wall_Mounted Zamil 2.24TR SEER 10.35'),
('Split_Wall_Mounted','Samsung','AQ18FCN','Non-Inverter','1.5',1.5,18000,1900,9.4700000000000006,15267.8295,2250,6.7857019999999997,8.0389999999999997,'Split_Wall_Mounted Samsung 1.5TR SEER 8.039','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','Carrier','42XP100H3PE','Non-Inverter','2.5',2.75,33000,3309.9297893681041,9.9700000000000006,29500,4057.7716643741405,7.27,8.5399999999999991,'Split_Wall_Mounted Carrier 2.75TR SEER 8.54','Split_Wall_Mounted Carrier 2.75TR SEER 8.54'),
('Split_Wall_Mounted','LG','S242MH ST0','Non-Inverter','2',1.91,22996.87233437589,2630,8.74,20062.553312482229,3035,6.6103964785773401,7.54,'Split_Wall_Mounted LG 1.91TR SEER 7.54','Split_Wall_Mounted LG 1.91TR SEER 7.54'),
('Split_Wall_Mounted','LG','NS242H3','Inverter','1.5',1.79,21500,1734,12.39,18500,2127,8.6976962858486129,10.47,'Split_Wall_Mounted LG 1.79TR SEER 10.47','Inverter unit "No replacement"'),
('Split_Wall_Mounted','LG','NT382H','Inverter','2.5',2.5,30000,2440,12.29,25400,2885,8.8041594454072793,10.43,'Split_Wall_Mounted LG 2.5TR SEER 10.43','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Arven','ARS120FE6X','Non-Inverter','1.5',1.53,18400,1510,12.18,15800,1800,8.7777777777777786,10.36,'Split_Wall_Mounted Arven 1.53TR SEER 10.36','Split_Wall_Mounted Okia 1.53TR SEER 10.37'),
('Split_Wall_Mounted','Haam','S-036H/hr','Non-Inverter','2.5',2.5,30000,3460,8.67,25200,3900,6.4615384615384617,7.43,'Split_Wall_Mounted Haam 2.5TR SEER 7.43','Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Wall_Mounted','Crown','CROWN24C','Non-Inverter','2',1.79,21500,1770,12.14,18600,2130,8.7323943661971839,10.33,'Split_Wall_Mounted Crown 1.79TR SEER 10.33','Split_Wall_Mounted Crown 1.79TR SEER 10.33'),
('Split_Wall_Mounted','Kimatsu','KSA 30000 CH','Non-Inverter','2',2.0299999999999998,24450,2054,11.9,20950,2464,8.5024350649350655,10.1,'Split_Wall_Mounted Kimatsu 2.03TR SEER 10.1','Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','Haam','HM24CWM','Non-Inverter','2',1.9,22800,1880,12.12,19220,2210,8.6968325791855197,10.29,'Split_Wall_Mounted Haam 1.9TR SEER 10.29','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','Lakes','LSAC-24C/A','Non-Inverter','1.5',1.73,20813,2420,8.6,17742,2650,6.6950943396226412,7.46,'Split_Wall_Mounted Lakes 1.73TR SEER 7.46','Split_Wall_Mounted Daikin 1.78TR SEER 7.47'),
('Split_Wall_Mounted','Unix','MUNIXSP-12CN','Non-Inverter','1',1,12000,1020,11.76,10500,1230,8.536585365853659,10.039999999999999,'Split_Wall_Mounted Unix 1TR SEER 10.04','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Falcon','FSEH 19K5','Non-Inverter','1.5',1.55,18600,2450,7.59,14780.779073073643,2830,5.2228901318281427,6.34,'Split_Wall_Mounted Falcon 1.55TR SEER 6.34','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','Mando','AC-MD18H-FW','Non-Inverter','1.5',1.43,17197,1431,12.01,14899,1703,8.7486788021139166,10.26,'Split_Wall_Mounted Mando 1.43TR SEER 10.26','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','LG','S3228Q','Non-Inverter','2',2.21,26613.59112880296,2790,9.5299999999999994,23713.392095535972,3450,6.8734469842133255,8.1300000000000008,'Split_Wall_Mounted LG 2.21TR SEER 8.13','Split_Wall_Mounted LG 2.21TR SEER 8.14'),
('Split_Wall_Mounted','LG','S182NH / GS-H1825NB2','Non-Inverter','1.5',1.49,17981.23400625533,2060,8.7200000000000006,15490.474836508389,2370,6.5360653318600797,7.5,'Split_Wall_Mounted LG 1.49TR SEER 7.5','Split_Wall_Mounted LG 1.46TR SEER 7.56'),
('Split_Wall_Mounted','Haam','HM18H/7S16','Non-Inverter','1.5',1.45,17400,1510,11.52,14900,1730,8.6127167630057802,9.89,'Split_Wall_Mounted Haam 1.45TR SEER 9.89','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','Samsung','ARS24HPFNBWKN','Non-Inverter','2',1.93,23200,2340,9.91,20230,2700,7.4925925925925929,8.5500000000000007,'Split_Wall_Mounted Samsung 1.93TR SEER 8.55','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','Starway','SWAC24KC','Non-Inverter','2',1.84,22100,1811,12.2,18400,2152,8.5501858736059475,10.27,'Split_Wall_Mounted Starway 1.84TR SEER 10.27','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','Awalgulf','EWAA18SC2BCBX','Non-Inverter','1.5',1.43,17200,1490,11.54,15239,1836,8.3001089324618729,9.83,'Split_Wall_Mounted Awalgulf 1.43TR SEER 9.83','Split_Wall_Mounted LG 1.45TR SEER 9.84'),
('Split_Wall_Mounted','Zamil','MH180CEB','Non-Inverter','1.5',1.5,18000,2200,8.18,12800,2400,5.333333333333333,6.69,'Split_Wall_Mounted Zamil 1.5TR SEER 6.69','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','General','EASN36H1','Non-Inverter','2.5',2.41,29012,2454,11.82,24720,2944,8.3967391304347831,10.01,'Split_Wall_Mounted General 2.41TR SEER 10.01','Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Wall_Mounted','General','EASN24H2','Non-Inverter','1.5',1.75,21040,1815,11.59,17060,2055,8.3017031630170308,9.8000000000000007,'Split_Wall_Mounted General 1.75TR SEER 9.8','Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','Crown','BSACL-F12C7','Non-Inverter','1',0.93,11260,930,12.1,9895,1150,8.6043478260869559,10.28,'Split_Wall_Mounted Crown 0.93TR SEER 10.28','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted',' Zamil','ADX18ECAXFQ','Non-Inverter','1.5',1.49,17994,2250,7.99,14995,2500,5.9980000000000002,6.86,'Split_Wall_Mounted  Zamil 1.49TR SEER 6.86','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','Zamil','AHM18CEBW','Non-Inverter','1.5',1.5,18000,2100,8.57,15000,2400,6.25,7.29,'Split_Wall_Mounted Zamil 1.5TR SEER 7.29','Split_Wall_Mounted LG 1.46TR SEER 7.28'),
('Split_Wall_Mounted','Gree','GWC18MC-D1TA3A/O','Non-Inverter','1.5',1.5,18083,2250,8.0299999999999994,16200,2550,6.3529411764705879,7.03,'Split_Wall_Mounted Gree 1.5TR SEER 7.03','Split_Wall_Mounted Gree 1.5TR SEER 7.03'),
('Split_Wall_Mounted','Fuji','RSA30RBT','Non-Inverter','2',2.16,26000,3210,8.09,22900,3600,6.3611111111111107,7.06,'Split_Wall_Mounted Fuji 2.16TR SEER 7.06','Split_Wall_Mounted MITSUBISHI 2.03TR SEER 7.10'),
('Split_Wall_Mounted','Mando','MP920-24H','Non-Inverter','2',1.83,22000,1781,12.35,18400,2114,8.7038789025543988,10.42,'Split_Wall_Mounted Mando 1.83TR SEER 10.42','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Arrow','RO-12LHX','Non-Inverter','1',0.93,11260,930,12.1,9895,1150,8.6043478260869559,10.28,'Split_Wall_Mounted Arrow 0.93TR SEER 10.28','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Starway','SWT18HR','Non-Inverter','1.5',1.51,18185.98,1840,9.8800000000000008,15285.76,2100,7.2789333333333337,8.44,'Split_Wall_Mounted Starway 1.51TR SEER 8.44','Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','Ugine','UTS24LSHR-7','Non-Inverter','2',1.87,22500,1899,11.84,19000,2235,8.5011185682326627,10.050000000000001,'Split_Wall_Mounted Ugine 1.87TR SEER 10.05','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','Ugine','UTS30LSHC-7','Non-Inverter','2',2.19,26300,2230,11.79,22800,2680,8.5074626865671643,10.039999999999999,'Split_Wall_Mounted Ugine 2.19TR SEER 10.04','Split_Wall_Mounted GREE 2.19TR SEER 10.05'),
('Split_Wall_Mounted','Ugine','UTS36LSHC-7','Non-Inverter','2.5',2.5,30000,2540,11.81,25200,2960,8.513513513513514,10.032,'Split_Wall_Mounted Ugine 2.5TR SEER 10.032','Split_Wall_Mounted LG 2.5TR SEER 10.43'),
('Split_Wall_Mounted','MAU','MAUSP-24CN','Non-Inverter','2',1.9,22800,1880,12.12,19220,2210,8.6968325791855197,10.29,'Split_Wall_Mounted MAU 1.9TR SEER 10.29','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','HI Home','HSO24HC-7','Non-Inverter','2',1.87,22500,1899,11.84,19000,2235,8.5011185682326627,10.050000000000001,'Split_Wall_Mounted HI Home 1.87TR SEER 10.05','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','Samsung','AR24MRFHRWKN','Non-Inverter','1.5',1.66,20000,1690,11.83,18500,1950,9.4871794871794872,10.42,'Split_Wall_Mounted Samsung 1.66TR SEER 10.42','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Comfort','MSAC-18CHS/XT7','Non-Inverter','1.5',1.5,18000,1524,11.81,15500,1810,8.5635359116022105,10.067,'Split_Wall_Mounted Comfort 1.5TR SEER 10.067','Split_Wall_Mounted LG 1.47TR SEER 10.15'),
('Split_Wall_Mounted','Samsung','AS24UUPN','Non-Inverter','2',2,24000,2750,8.7200000000000006,19828.349999999999,3200,6.1963593749999992,7.37,'Split_Wall_Mounted Samsung 2TR SEER 7.37','Split_Wall_Mounted Zamil 2.11TR SEER7.24'),
('Split_Wall_Mounted','Samsung','AQ18UUQN','Non-Inverter','1.5',1.5,18000,1900,9.4700000000000006,15278,2250,6.7902222222222219,8.0399999999999991,'Split_Wall_Mounted Samsung 1.5TR SEER 8.04','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','Samsung','AQ18UUQX','Non-Inverter','1.5',1.5,18000,1900,9.4700000000000006,15267.8295,2250,6.7857019999999997,8.0299999999999994,'Split_Wall_Mounted Samsung 1.5TR SEER 8.03','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','Chigo','CSA-18CO','Non-Inverter','1.5',1.45,17400,1810,9.61,15300,2100,7.2857142857142856,8.3000000000000007,'Split_Wall_Mounted Chigo 1.45TR SEER 8.3','Split_Wall_Mounted LG 1.53TR SEER 8.30'),
('Split_Wall_Mounted','Chigo','CZS-18CO','Non-Inverter','1.5',1.38,16675,1450,11.5,14362,1670,8.6,9.8800000000000008,'Split_Wall_Mounted Chigo 1.38TR SEER 9.88','Split_Wall_Mounted Chigo 1.38TR SEER 9.88'),
('Split_Wall_Mounted','Chigo','CZS-12CO','Non-Inverter','1',0.98,11845,1030,11.5,10164,1210,8.4,9.81,'Split_Wall_Mounted Chigo 0.98TR SEER 9.81','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Haam','HM24H/7S17','Non-Inverter','1.5',1.62,19550,1700,11.5,17264,2080,8.3000000000000007,9.81,'Split_Wall_Mounted Haam 1.62TR SEER 9.81','Split_Wall_Mounted Zamil 1.47TR SEER 9.8'),
('Split_Wall_Mounted','Gree','GWC18ACD-D3NTA1G/O','Non-Inverter','1.5',1.5,18000,1481,12.15,15000,1754,8.5518814139110599,10.25,'Split_Wall_Mounted Gree 1.5TR SEER 10.25','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','MTC','MTC12CT19N','Non-Inverter','1',1,12100,1021,11.85,10600,1269,8.3530338849487791,10.029999999999999,'Split_Wall_Mounted MTC 1TR SEER 10.03','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Gree','HSL24RHN1-SA','Non-Inverter','1.5',1.75,21000,1729,12.14,17500,2047,8.5490962383976559,10.24,'Split_Wall_Mounted Gree 1.75TR SEER 10.24','Split_Wall_Mounted LG 1.83TR SEER 10.27'),
('Split_Wall_Mounted','Dansat','DSH24CH','Non-Inverter','2',1.83,22000,1850,11.89,19500,2250,8.6666666666666661,10.17,'Split_Wall_Mounted Dansat 1.83TR SEER 10.17','Split_Wall_Mounted Gree 1.83TR SEER 10.17'),
('Split_Wall_Mounted','Mando','AC-24H-MP','Non-Inverter','2',1.93,23202,2000,11.6,19899,2390,8.325941422594143,9.85,'Split_Wall_Mounted Mando 1.93TR SEER 9.85','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Sky star','SKYSTAR-24CH','Non-Inverter','2',1.84,22178,1820,12.18,19107,2200,8.6850000000000005,10.34,'Split_Wall_Mounted Sky star 1.84TR SEER 10.34','Split_Wall_Mounted Crown 1.79TR SEER 10.33'),
('Split_Wall_Mounted','Unistar','UNISTARS-24C','Non-Inverter','1.5',1.79,21580.9,2200,9.8000000000000007,19790.599999999999,2530,7.8223715415019761,8.6199999999999992,'Split_Wall_Mounted Unistar 1.79TR SEER 8.62','Split_Wall_Mounted Carrier 1.79TR SEER 8.31'),
('Split_Wall_Mounted','General','GS TN12C','Non-Inverter','1',0.95,11500,930,12.36,9900,1135,8.7224669603524223,10.46,'Split_Wall_Mounted General 0.95TR SEER 10.46','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Daewoo','DSA-240L-R','Non-Inverter','2',2,24000,2500,9.6,17500,2850,6.1403508771929829,7.82,'Split_Wall_Mounted Daewoo 2TR SEER 7.82','Split_Wall_Mounted DAEWOO 2TR SEER 7.86'),
('Split_Wall_Mounted','General Electric ','GESFAC18INT','Non-Inverter','1.5',1.5,18000,1481,12.15,15300,1789,8.5522638345444388,10.27,'Split_Wall_Mounted General Electric  1.5TR SEER 10.27','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','York','YJFE24XH3CHA-R4','Non-Inverter','2',1.83,22000,1811,12.14,19000,2222,8.5508550855085517,10.27,'Split_Wall_Mounted York 1.83TR SEER 10.27','Split_Wall_Mounted LG 1.83TR SEER 10.27'),
('Split_Wall_Mounted','Haas','HSA125FE6H','Non-Inverter','2',1.91,23000,1870,12.29,19800,2275,8.7032967032967026,10.42,'Split_Wall_Mounted Haas 1.91TR SEER 10.42','Split_Wall_Mounted Mando 1.84TR SEER 10.28'),
('Split_Wall_Mounted','York','YQFE24XH3CHPR5','Non-Inverter','2',1.83,22000,1810,12.15,19000,2222,8.5508550855085517,10.28,'Split_Wall_Mounted York 1.83TR SEER 10.28','Split_Wall_Mounted LG 1.83TR SEER 10.27'),
('Split_Wall_Mounted','York','YQFE30XH3CHQ-R5','Non-Inverter','2.5',2.2799999999999998,27400,2283,12,23200,2682,8.6502609992542876,10.199999999999999,'Split_Wall_Mounted York 2.28TR SEER 10.2','Split_Wall_Mounted LG 2.5TR SEER 10.43'),
('Split_Wall_Mounted','Gree','GWC24MD-D1NTA8GI','Non-Inverter','2',1.83,22000,2234,9.84,19600,2741,7.1506749361546884,8.42,'Split_Wall_Mounted Gree 1.83TR SEER 8.42','Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','Zamil','ADO26CHXOW','Non-Inverter','2',1.99,23998,2078,11.54,19299,2325,8.3006451612903227,9.77,'Split_Wall_Mounted Zamil 1.99TR SEER 9.77','Split_Wall_Mounted Zamil 1.99TR SEER9.77'),
('Split_Wall_Mounted','SkyStar','ARTI030CV60N0FR','Non-Inverter','2.5',2.33,28000,2393,11.7,23500,2828,8.3097595473833099,9.9,'Split_Wall_Mounted SkyStar 2.33TR SEER 9.9','Split_Wall_Mounted Zamil 2.35TR SEER 9.85'),
('Split_Wall_Mounted','Hisense','AS-30HTS','Non-Inverter','2.5',2.27,27300,2255,12.1,24200,2775,8.7207207207207205,10.33,'Split_Wall_Mounted Hisense 2.27TR SEER 10.33','Split_Wall_Mounted Zamil 2.24TR SEER 10.35'),
('Split_Wall_Mounted','Frego','AXI12CV60L0FR','Non-Inverter','1',0.95,11400,974,11.7,9300,1120,8.3035714285714288,9.8800000000000008,'Split_Wall_Mounted Frego 0.95TR SEER 9.88','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Floor_Standing','Basic','BVSACL-F60H7BVSACL-C60H7','Non-Inverter','4.5',4.42,53040,4420,12,46198,5230,8.8332695984703626,10.28,'Split_Floor_Standing Basic 4.42TR SEER 10.28','Split_Floor_Standing Samsung 4TR SEER 10.3'),
('Split_Floor_Standing','SkyStar','EQB60SCAC2','Non-Inverter','4.5',4.55,54600,4731,11.54,46956,5651,8.3093257830472478,9.82,'Split_Floor_Standing SkyStar 4.55TR SEER 9.82','Split_Floor_Standing Zamil 4.421TR SEER 10.15'),
('Split_Floor_Standing','Frego','FF50X2M7','Non-Inverter','4',3.85,46200,3970,11.63,41000,4920,8.3333333333333339,9.91,'Split_Floor_Standing Frego 3.85TR SEER 9.91','Split_Floor_Standing Carrier 4TR SEER 9.95'),
('Split_Floor_Standing','Frego','FF60X2H','Non-Inverter','4',3.95,47400,3890,12.18,40800,4740,8.6075949367088604,10.31,'Split_Floor_Standing Frego 3.95TR SEER 10.31','Split_Floor_Standing Samsung 4TR SEER 10.3'),
('Split_Wall_Mounted','Frego','FW18X-2A7','Non-Inverter','1.5',1.5,18000,1525,11.8,14900,1773,8.4038353073886061,9.98,'Split_Wall_Mounted Frego 1.5TR SEER 9.98','Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','Frego','FW24C-2Q9','Non-Inverter','2',1.8,21600,1800,12,18400,2200,8.3636363636363633,10.11,'Split_Wall_Mounted Frego 1.8TR SEER 10.11','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','Frego','FW30C-2Q9','Non-Inverter','2',2.13,25600,2100,12.19,21700,2550,8.5098039215686274,10.27,'Split_Wall_Mounted Frego 2.13TR SEER 10.27','Split_Wall_Mounted Carrier 2.25TR SEER 10.20'),
('Split_Wall_Mounted','Frego','FW30X-2T7','Non-Inverter','2',2.04,24500,2110,11.61,19790,2385,8.2976939203354299,9.81,'Split_Wall_Mounted Frego 2.04TR SEER 9.81','Split_Wall_Mounted LG 1.99TR SEER 9.80'),
('Split_Wall_Mounted','Frego','FW30Y2S7','Non-Inverter','2.5',2.31,27800,2310,12.03,24200,2740,8.8321167883211675,10.3,'Split_Wall_Mounted Frego 2.31TR SEER 10.3','Split_Wall_Mounted Zamil 2.24TR SEER 10.35'),
('Split_Wall_Mounted','Zamil','MAZ12CHXAW','Non-Inverter','1',0.91,11000,1010,10.89,10100,1210,8.3471074380165291,9.4700000000000006,'Split_Wall_Mounted Zamil 0.91TR SEER 9.47','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','HITACHI','RAC-19JHP4','Non-Inverter','1.5',1.38,16620,1820,9.1300000000000008,15870,2140,7.41588785046729,8.09,'Split_Wall_Mounted HITACHI 1.38TR SEER 8.09','Split_Wall_Mounted LG 1.52TR SEER 8.15'),
('Split_Wall_Mounted','Kleenair','S12CSA','Non-Inverter','1',0.97,11700,1008,11.6,10080,1215,8.2962962962962958,9.86,'Split_Wall_Mounted Kleenair 0.97TR SEER 9.86','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','SkyStar','SKYSTAR-24UB','Non-Inverter','2',1.8,21600,1800,12,18400,2200,8.3636363636363633,10.11,'Split_Wall_Mounted SkyStar 1.8TR SEER 10.11','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','SkyStar','SKYSTAR-30UB','Non-Inverter','2',2.13,25600,2100,12.19,21700,2550,8.5098039215686274,10.27,'Split_Wall_Mounted SkyStar 2.13TR SEER 10.27','Split_Wall_Mounted Carrier 2.25TR SEER 10.20'),
('Split_Wall_Mounted','LG','S252SH','Non-Inverter','2',2.08,25000,2750,9.09,20813.199999999997,3000,6.9377333333333322,7.83,'Split_Wall_Mounted LG 2.08TR SEER 7.83','Split_Wall_Mounted DAEWOO 2TR SEER 7.86'),
('Split_Wall_Mounted','Carrier','40FWD030-303DA','Non-Inverter','2.5',2.5,30000,3086.4197530864194,9.7200000000000006,null,null,null,null,'Split_Wall_Mounted Carrier 2.5TR SEER -','Split_Wall_Mounted LG 2.58TR SEER 9.72'),
('Split_Wall_Mounted','Panorama','PWC30M1T','Non-Inverter','2.5',2.33,28000,null,null,null,null,null,null,'Split_Wall_Mounted Panorama 2.33TR SEER -','Split_Wall_Mounted Zamil 2.11TR SEER7.24'),
('Split_Wall_Mounted','Panorama','PWH18M6I','Non-Inverter','1.5',1.48,17800,null,null,null,null,null,null,'Split_Wall_Mounted Panorama 1.48TR SEER -','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','Luna','LAC-240CAU','Non-Inverter','2',1.8,21600,1800,12,18400,2200,8.3636363636363633,10.11,'Split_Wall_Mounted Luna 1.8TR SEER 10.11','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','Gree','GWC30FA-D1NTA3B/I','Non-Inverter','2',2.27,27300,null,null,null,null,null,null,'Split_Wall_Mounted Gree 2.27TR SEER -','Split_Wall_Mounted Zamil 2.11TR SEER7.24'),
('Split_Wall_Mounted','Alessa','DS24FE6GP3','Non-Inverter','2',1.9,22833,null,null,null,null,null,null,'Split_Wall_Mounted Alessa 1.9TR SEER -','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Akai','AK25WSC','Non-Inverter','2',1.8,21666.199999999997,3500,6.19,null,null,null,null,'Split_Wall_Mounted Akai 1.8TR SEER -','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Akai','GH12C','Non-Inverter','1',0.9,10800,1250,8.64,8208,1440,5.7,7.12,'Split_Wall_Mounted Akai 0.9TR SEER 7.12','Split_Wall_Mounted LG 0.95TR SEER 7.9'),
('Split_Floor_Standing','Arrow','RO-60CLA-H','Non-Inverter','4',3.95,47400,3890,12.18,40800,4740,8.6075949367088604,10.31,'Split_Floor_Standing Arrow 3.95TR SEER 10.31','Split_Floor_Standing Samsung 4TR SEER 10.3'),
('Split_Wall_Mounted','Arrow','RO-18CBA-C','Non-Inverter','1.5',1.44,17300,1430,12.09,14900,1710,8.7134502923976616,10.29,'Split_Wall_Mounted Arrow 1.44TR SEER 10.29','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','AUX','AUX 24CN','Inverter','2',1.8,21600,1800,12,18400,2200,8.3636363636363633,10.11,'Split_Wall_Mounted AUX 1.8TR SEER 10.11','Inverter unit "No replacement"'),
('Split_Wall_Mounted','AUX','AUX 24CF','Non-Inverter','2',1.79,21495,1800,11.94,18425,2150,8.5697674418604652,10.15,'Split_Wall_Mounted AUX 1.79TR SEER 10.15','Split_Wall_Mounted Carrier 1.84TR SEER 10.16'),
('Split_Wall_Mounted','AUX','AUX 18C','Non-Inverter','1.5',1.49,17913,1480.4132231404958,12.1,15354,1760,8.723863636363637,10.29,'Split_Wall_Mounted AUX 1.49TR SEER 10.29','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','BANCOOL','AMBC24DC','Inverter','2',1.81,21800,1816.6666666666667,12,18400,2206.2350119904077,8.34,10.1,'Split_Wall_Mounted BANCOOL 1.81TR SEER 10.1','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Basic','BSAC-F24CS','Non-Inverter','2',1.76,21154,null,null,null,null,null,null,'Split_Wall_Mounted Basic 1.76TR SEER -','Split_Wall_Mounted LG 1.87TR SEER 7.14'),
('Split_Wall_Mounted','Basic','BSACCA-F130CB','Inverter','2',2.2799999999999998,27400,2220,12.34,24800,2950,8.4067796610169498,10.38,'Split_Wall_Mounted Basic 2.28TR SEER 10.38','Inverter unit "No replacement"'),
('Split_Wall_Mounted','Basic','BSAC-24C5','Non-Inverter','2',1.83,22000,2260,9.73,19000,2675,7.1028037383177569,8.31,'Split_Wall_Mounted Basic 1.83TR SEER 8.31','Split_Wall_Mounted Carrier 1.79TR SEER 8.31'),
('Split_Wall_Mounted','Basic','BSAC-F36H5','Non-Inverter','2.5',2.66,32004,3257,9.82,29991,3995,7.5071339173967457,8.56,'Split_Wall_Mounted Basic 2.66TR SEER 8.56','Split_Wall_Mounted Carrier 2.75TR SEER 8.54'),
('Split_Wall_Mounted','Basic','BSACH-F18CD','Non-Inverter','1.5',1.48,17813,1480,12.03,15354,1780,8.6258426966292134,10.23,'Split_Wall_Mounted Basic 1.48TR SEER 10.23','Split_Wall_Mounted Ugine 1.48TR SEER 10.23'),
('Split_Wall_Mounted','Basic','BSSL186CAU','Non-Inverter','1.5',1.49,17913,1480,12.1,15354,1760,8.723863636363637,10.3,'Split_Wall_Mounted Basic 1.49TR SEER 10.3','Split_Wall_Mounted Mando 1.5TR SEER 10.35'),
('Split_Wall_Mounted','Besat','BSSL246CAU','Non-Inverter','2',1.84,22178,1820,12.18,19107,2200,8.6850000000000005,10.34,'Split_Wall_Mounted Besat 1.84TR SEER 10.34','Split_Wall_Mounted Crown 1.79TR SEER 10.33'),
('Split_Floor_Standing','Carrier','42SFL7B1A','Non-Inverter','4.5',4.66,56000,4590,12.2,50000,5556,8.9992800575953922,10.48,'Split_Floor_Standing Carrier 4.66TR SEER 10.48','Split_Floor_Standing Zamil 4.421TR SEER 10.15'),
('Split_Wall_Mounted','Champion','CHSAI-18H','Non-Inverter','1.5',1.5,18000,1940,9.27,16100,2370,6.7932489451476794,7.95,'Split_Wall_Mounted Champion 1.5TR SEER 7.95','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','CHIGO','CSA-30CO','Non-Inverter','2',1.99,23884,2670,8.94,21836.800000000003,3100,7.0441290322580654,7.83,'Split_Wall_Mounted CHIGO 1.99TR SEER 7.83','Split_Wall_Mounted DAEWOO 2TR SEER 7.86'),
('Split_Wall_Mounted','Class','CL24E6','Non-Inverter','2',1.7,20472,3200,6.39,23500,2600,9.0384615384615383,6.56,'Split_Wall_Mounted Class 1.7TR SEER 6.56','Split_Wall_Mounted LG 1.74TR SEER 8.20'),
('Split_Wall_Mounted','Class','CL18E6','Non-Inverter','1.5',1.5,18000,2040,8.82,null,null,null,null,'Split_Wall_Mounted Class 1.5TR SEER -','Split_Wall_Mounted LG 1.5TR SEER 8.40'),
('Split_Wall_Mounted','Class','CL24E6XL','Non-Inverter','2',1.84,22178,1820,12.18,19107,2200,8.6850000000000005,10.34,'Split_Wall_Mounted Class 1.84TR SEER 10.34','Split_Wall_Mounted Crown 1.79TR SEER 10.33'),
('Split_Wall_Mounted','Classic','ADU24CHAXFQ','Non-Inverter','2',1.95,23491.62,2975,7.89,18994.603999999999,3325,5.712662857142857,6.69,'Split_Wall_Mounted Classic 1.95TR SEER 6.69','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','ultra Plus','HWX30ECAYFU','Non-Inverter','2.5',2.41,29000,3100,9.35,null,null,null,null,'Split_Wall_Mounted ultra Plus 2.41TR SEER -','Split_Wall_Mounted LG 2.58TR SEER 9.72'),
('Split_Floor_Standing','Comfort line','MSAC-48CF7','Non-Inverter','4',3.69,44356,3845,11.53,null,null,null,null,'Split_Floor_Standing Comfort line 3.69TR SEER -','Split_Floor_Standing LG 4TR SEER 10.51'),
('Split_Wall_Mounted','Comfort line','MSAC-12CHS/GT2','Non-Inverter','1',0.89,10768.272000000001,1299,8.2799999999999994,null,null,null,null,'Split_Wall_Mounted Comfort line 0.89TR SEER -','Split_Wall_Mounted LG 0.95TR SEER 8.3'),
('Split_Wall_Mounted','Comfort line','MSAC-18CS/P2','Non-Inverter','1.5',1.53,18400,1484,12.39,15300,1800,8.5,10.38,'Split_Wall_Mounted Comfort line 1.53TR SEER 10.38','Split_Wall_Mounted Mando 1.53TR SEER 10.38'),
('Split_Wall_Mounted','Comfort line','MSAC-30CS/P1','Non-Inverter','2.5',2.2999999999999998,27600,2262,12.2,23300,2670,8.726591760299625,10.35,'Split_Wall_Mounted Comfort line 2.3TR SEER 10.35','Split_Wall_Mounted Zamil 2.24TR SEER 10.35'),
('Split_Wall_Mounted','Cooline','TAL24CCXED','Non-Inverter','2',1.75,21100,1744,12.09,null,null,null,null,'Split_Wall_Mounted Cooline 1.75TR SEER -','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Craft','DSA36FE6YHA1','Non-Inverter','2.5',2.6,31200,2580,12.09,27200,3145,8.6486486486486491,10.28,'Split_Wall_Mounted Craft 2.6TR SEER 10.28','Split_Wall_Mounted Carrier 2.58TR SEER 10.41'),
('Split_Wall_Mounted','Craft','DS24FE7M5','Non-Inverter','2',2.0099999999999998,24200,2530,9.56,20001.144,2850,7.0179452631578947,8.15,'Split_Wall_Mounted Craft 2.01TR SEER 8.15','Split_Wall_Mounted LG 2.21TR SEER 8.14'),
('Split_Wall_Mounted','Craft','0524FE7M1','Non-Inverter','2',1.75,21000,1721,12.2,null,null,null,null,'Split_Wall_Mounted Craft 1.75TR SEER -','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Alessa','DS24FE6GP3.','Non-Inverter','2',1.9,22833,null,null,null,null,null,null,'Split_Wall_Mounted Alessa 1.9TR SEER -','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Craft','DSA125FE6CL7','Non-Inverter','2',1.75,21000,1712,12.26,null,null,null,null,'Split_Wall_Mounted Craft 1.75TR SEER -','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Craft','DSA25FE6GR7E','Non-Inverter','2',1.83,22000,null,null,null,null,null,null,'Split_Wall_Mounted Craft 1.83TR SEER -','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Craft','DSA30FE6GR7E','Non-Inverter','2',2.27,27300,null,null,null,null,null,null,'Split_Wall_Mounted Craft 2.27TR SEER -','Split_Wall_Mounted Zamil 2.11TR SEER7.24'),
('Split_Floor_Standing','Craft','CF56FE7HS7FM','Non-Inverter','4.5',4.3,51600,4250,12.14,44200,5250,8.4190476190476193,10.220000000000001,'Split_Floor_Standing Craft 4.3TR SEER 10.22','Split_Floor_Standing Zamil 4.421TR SEER 10.15'),
('Split_Floor_Standing','Alessa','DS60FE7HS7FM','Non-Inverter','4.5',4.3899999999999997,52746,4404,11.97,45799.275999999998,5454,8.3973736707004036,10.119999999999999,'Split_Floor_Standing Alessa 4.39TR SEER 10.12','Split_Floor_Standing Zamil 4.421TR SEER 10.15'),
('Split_Wall_Mounted','Craft','DSA25FE6GR7N','Non-Inverter','2',1.83,22000,null,null,null,null,null,null,'Split_Wall_Mounted Craft 1.83TR SEER -','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Crony','CNY24CCF','Non-Inverter','2',1.79,21495,1800,11.94,18425,2150,8.5697674418604652,10.15,'Split_Wall_Mounted Crony 1.79TR SEER 10.15','Split_Wall_Mounted Carrier 1.84TR SEER 10.16'),
('Split_Wall_Mounted','LG','GVSP24HC','Inverter','2',1.83,22000,1795.9183673469388,12.25,null,null,null,null,'Split_Wall_Mounted LG 1.83TR SEER -','Inverter unit "No replacement"'),
('Split_Wall_Mounted','DAIYA','DA18CS','Non-Inverter','1.5',1.5,18000,null,null,null,null,null,null,'Split_Wall_Mounted DAIYA 1.5TR SEER -','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','Dansat','DSA30WCH','Non-Inverter','2',2.2200000000000002,26700,2315,11.53,22500,2725,8.2568807339449535,9.7799999999999994,'Split_Wall_Mounted Dansat 2.22TR SEER 9.78','Split_Wall_Mounted Samsung 2.33TR SEER 9.83'),
('Split_Wall_Mounted','CRONY','CRONY-24B2/SUA','Non-Inverter','2',1.91,23001,2460,9.35,20003.2,3040,6.58,7.91,'Split_Wall_Mounted CRONY 1.91TR SEER 7.91','Split_Wall_Mounted Carrier 1.81TR SEER 7.91'),
('Split_Wall_Mounted','Eurostar','SA24C606S-T15','Non-Inverter','2',1.75,21040,1815,11.59,17060,2055,8.3017031630170308,9.8000000000000007,'Split_Wall_Mounted Eurostar 1.75TR SEER 9.8','Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','Falcon','FMS24CB','Inverter','2',1.84,22100,1811,12.2,18400,2152,8.5501858736059475,10.28,'Split_Wall_Mounted Falcon 1.84TR SEER 10.28','Inverter unit "No replacement"'),
('Split_Wall_Mounted','NA','FLM24H','Non-Inverter','2',1.84,22178,2437.1428571428573,9.1,null,null,null,null,'Split_Wall_Mounted NA 1.84TR SEER -','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','Falcon','FQS24C8','Non-Inverter','2',1.75,21000,1720,12.2,18000,2070,8.695652173913043,10.35,'Split_Wall_Mounted Falcon 1.75TR SEER 10.35','Split_Wall_Mounted Carrier 1.79TR SEER 10.35'),
('Split_Wall_Mounted','Falcon','FTS30H','Non-Inverter','2',2.2000000000000002,26400,2129,12.4,null,null,null,null,'Split_Wall_Mounted Falcon 2.2TR SEER -','Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Floor_Standing','Falcon','EQ048SCAA','Non-Inverter','4',4,48000,null,null,null,null,null,null,'Split_Floor_Standing Falcon 4TR SEER -','Split_Floor_Standing LG 4.35TR SEER 7.05'),
('Split_Wall_Mounted','Falcon','FHS24H5','Non-Inverter','2',1.91,23000,1925,11.94,19000,2290,8.2969432314410483,10.029999999999999,'Split_Wall_Mounted Falcon 1.91TR SEER 10.03','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','FISHER','FGSAP-F24C7N','Non-Inverter','2',1.83,22000,null,null,null,null,null,null,'Split_Wall_Mounted FISHER 1.83TR SEER -','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Frego','S-036H','Non-Inverter','3',3,36000,3460,10.4,null,null,null,null,'Split_Wall_Mounted Frego 3TR SEER -','Split_Wall_Mounted Carrier 2.75TR SEER 8.81'),
('Split_Wall_Mounted','Frego','FW24X-2A','Non-Inverter','2',1.83,22000,null,null,null,null,null,null,'Split_Wall_Mounted Frego 1.83TR SEER -','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Frego','FW24X-2AR','Non-Inverter','2',1.77,21300,null,null,null,null,null,null,'Split_Wall_Mounted Frego 1.77TR SEER -','Split_Wall_Mounted LG 1.87TR SEER 7.14'),
('Split_Wall_Mounted','Frego','FW24X-2N6/FO24X-2N6','Non-Inverter','2',1.84,22178,1820,12.18,19107,2200,8.6850000000000005,10.34,'Split_Wall_Mounted Frego 1.84TR SEER 10.34','Split_Wall_Mounted Crown 1.79TR SEER 10.33'),
('Split_Wall_Mounted','Fuji','RSA24SET','Non-Inverter','2',1.95,23500,2660,8.83,20300,3150,6.4444444444444446,7.54,'Split_Wall_Mounted Fuji 1.95TR SEER 7.54','Split_Wall_Mounted LG 1.91TR SEER 7.54'),
('Split_Wall_Mounted','GIANT','GIANT36CCL','Non-Inverter','2.5',2.4500000000000002,29500,2440,12.09,25500,2945,8.6587436332767407,10.27,'Split_Wall_Mounted GIANT 2.45TR SEER 10.27','Split_Wall_Mounted Carrier 2.25TR SEER 10.20'),
('Split_Wall_Mounted','General Electric','AS1GC18BD2W','Non-Inverter','1.5',1.58,18998.016,1610,11.8,16797.276000000002,1910,8.7943853403141379,10.15,'Split_Wall_Mounted General Electric 1.58TR SEER 10.15','Split_Wall_Mounted LG 1.47TR SEER 10.15'),
('Split_Wall_Mounted','S.D.General','S.D.G18-B2/EAD','Non-Inverter','1.5',1.5,18000,1920,9.3699999999999992,16600,2350,7.0638297872340425,8.1199999999999992,'Split_Wall_Mounted S.D.General 1.5TR SEER 8.12','Split_Wall_Mounted LG 1.54TR SEER 8.14'),
('Split_Wall_Mounted','General Gold','GG18KCN','Non-Inverter','1.5',1.43,17180,1450,11.84,15000,1750,8.5714285714285712,10.1,'Split_Wall_Mounted General Gold 1.43TR SEER 10.1','Split_Wall_Mounted LG 1.47TR SEER 10.15'),
('Split_Wall_Mounted','Gree','GWCN24DCTD1A1A/I','Non-Inverter','2',2.02,24300,null,null,null,null,null,null,'Split_Wall_Mounted Gree 2.02TR SEER -','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Gree','GWC36QFXH-D3NTB4B/I','Non-Inverter','2.5',2.68,32200,null,null,null,null,null,null,'Split_Wall_Mounted Gree 2.68TR SEER -','Split_Wall_Mounted Royal Temp 2.67TR SEER 7.44'),
('Split_Wall_Mounted','Gree','GWH36LB-D1NTA8D/I','Non-Inverter','2.5',2.75,33000,null,null,null,null,null,null,'Split_Wall_Mounted Gree 2.75TR SEER -','Split_Wall_Mounted Carrier 2.75TR SEER 8.54'),
('Split_Wall_Mounted','Gree','GWCN24B5TD1LA','Non-Inverter','2',2,24000,3050,7.86,null,null,null,null,'Split_Wall_Mounted Gree 2TR SEER -','Split_Wall_Mounted DAEWOO 2TR SEER 7.86'),
('Split_Wall_Mounted','Gree','GWC30ACE-D3NTA1D/I','Non-Inverter','2',2.27,27300,null,null,null,null,null,null,'Split_Wall_Mounted Gree 2.27TR SEER -','Split_Wall_Mounted Zamil 2.11TR SEER7.24'),
('Split_Wall_Mounted','YONAN','KT3F-18GWIX','Non-Inverter','1.5',1.53,18400,1560,11.79,16600,1860,8.9247311827956981,10.210000000000001,'Split_Wall_Mounted YONAN 1.53TR SEER 10.21','Split_Wall_Mounted Ugine 1.48TR SEER 10.23'),
('Split_Wall_Mounted','Trane','4MWWCA24T1000AB','Non-Inverter','2',1.75,21000,1714,12.25,18000,2118,8.4985835694050991,10.31,'Split_Wall_Mounted Trane 1.75TR SEER 10.31','Split_Wall_Mounted Crown 1.79TR SEER 10.33'),
('Split_Wall_Mounted','LG','LO242C0','Inverter','2',1.9,22800,1839,12.39,19900,2287,8.7013554875382599,10.49,'Split_Wall_Mounted LG 1.9TR SEER 10.49','Inverter unit "No replacement"'),
('Split_Wall_Mounted','ugine','UGN24H','Non-Inverter','2',1.79,21495.599999999999,2528.8941176470585,8.5,null,null,null,null,'Split_Wall_Mounted ugine 1.79TR SEER -','Split_Wall_Mounted Carrier 1.79TR SEER 8.31'),
('Split_Floor_Standing','Gree','GVCN48ADTF1A2A/I','Non-Inverter','3.5',3.5,42000,null,null,null,null,null,null,'Split_Floor_Standing Gree 3.5TR SEER -','Split_Floor_Standing Zamil 3.42TR SEER 6.87'),
('Window','Carrier','51MSR243M-1S','Non-Inverter','2',1.83,22000,2530,8.69,18476,2980,6.2,7.36,'Window Carrier 1.83TR SEER 7.36','Window  Zamil 2TR SEER 7.33'),
('Window','Carrier','CRVD243M-1B','Non-Inverter','2',2,24000,2940,8.16,null,3250,0,null,'Window Carrier 2TR SEER -','Window LG 2TR SEER 7.48'),
('Split_Wall_Mounted','Zamil','MWZ24CCIXFTQ','Non-Inverter','2',1.85,22297.420000000002,2850,7.82,19550.760000000002,3300,5.924472727272728,6.76,'Split_Wall_Mounted Zamil 1.85TR SEER 6.76','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Window','LG','W242SH SN1','Non-Inverter','2',2,24000,3000,8,17401.199999999997,3200,5.4378749999999991,6.62,'Window LG 2TR SEER 6.62','Window Royal Temp 2TR SEER 6.41'),
('Split_Wall_Mounted','MANDO','MP20T-24C','Non-Inverter','2',1.91,23000,1917,11.99,null,null,null,null,'Split_Wall_Mounted MANDO 1.91TR SEER -','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Ceiling_Cassette','Classic','MFX60CSHDAD1','Non-Inverter','4.5',4.41,53000,4454,11.89,46400,5524,8.3997103548153511,10.08,'Split_Ceiling_Cassette Classic 4.41TR SEER 10.08','Split_Ceiling_Cassette LG 4.21TR SEER 7.69'),
('Split_Ceiling_Cassette','KELON','AS-24CT2FQ','Non-Inverter','2',null,null,2750,0,null,null,null,null,null,'Split_Ceiling_Cassette Carrier 1.97TR SEER 10.37'),
('Split_Ceiling_Cassette','ZAMIL','KRZ18CDGC','Non-Inverter','1.5',1.46,17599.096000000001,1524,11.54,14398.64,1735,8.2989279538904892,9.7799999999999994,'Split_Ceiling_Cassette ZAMIL 1.46TR SEER 9.78','Split_Ceiling_Cassette LG 1.5TR SEER 8.05'),
('Split_Ceiling_Cassette','ZAMIL','KYO24CSRHNAN','Non-Inverter','2',null,null,null,null,null,null,null,null,null,'Split_Ceiling_Cassette Carrier 1.97TR SEER 10.37'),
('Split_Ceiling_Cassette','LG','LT-C182EL','Non-Inverter','1.5',1.5,18000,1900,9.4700000000000006,15661.08,2150,7.284223255813953,8.2100000000000009,'Split_Ceiling_Cassette LG 1.5TR SEER 8.21','Split_Ceiling_Cassette LG 1.5TR SEER 8.05'),
('Split_Ceiling_Cassette','LG','LT-C242EL','Non-Inverter','2',2,24000,2500,9.6,20983.800000000003,2830,7.4147703180212021,8.33,'Split_Ceiling_Cassette LG 2TR SEER 8.33','Split_Ceiling_Cassette LG 2.0TR SEER 8.33'),
('Split_Ceiling_Cassette','FRIEDRICH','MR24YX6H','Non-Inverter','2',null,null,null,null,null,null,null,null,null,'Split_Ceiling_Cassette Carrier 1.97TR SEER 10.37'),
('Split_Ceiling_Cassette','LG','LT-H182ELEO','Non-Inverter','1.5',1.5,18000,1900,9.4700000000000006,15661.08,2150,7.284223255813953,8.2100000000000009,'Split_Ceiling_Cassette LG 1.5TR SEER 8.21','Split_Ceiling_Cassette LG 1.5TR SEER 8.05'),
('Split_Ceiling_Cassette','Classic ','KY030CSRHNANN','Non-Inverter','2.5',null,null,null,null,null,null,null,null,null,'Split_Ceiling_Cassette LG 2.32TR SEER 8.12'),
('Split_Ceiling_Cassette','LG','LBUH482RSA5','Non-Inverter','4',null,null,null,null,null,null,null,null,null,'Split_Ceiling_Cassette LG 4.21TR SEER 7.69'),
('Split_Ceiling_Cassette','Classic','KY024CSRHNANN','Non-Inverter','2',null,null,null,null,null,null,null,null,null,'Split_Ceiling_Cassette Carrier 1.97TR SEER 10.37'),
('Split_Ceiling_Cassette','Classic','KY60MSRHANN','Non-Inverter','5',null,null,null,null,null,null,null,null,null,'No Equivalent Found provide Pic & Datasheets'),
('Split_Ceiling_Cassette','Zamil','KYA030H','Non-Inverter','2.5',2.25,27000,2288,11.8,23000,2755,8.3484573502722323,9.98,'Split_Ceiling_Cassette Zamil 2.25TR SEER 9.98','Split_Ceiling_Cassette LG 2.32TR SEER 8.12')
on conflict (equipment_type, model_no) do update set
  make = excluded.make,
  compressor_type = excluded.compressor_type,
  size_category = excluded.size_category,
  tr = excluded.tr,
  t1_btu = excluded.t1_btu,
  t1_w = excluded.t1_w,
  t1_eer = excluded.t1_eer,
  t3_btu = excluded.t3_btu,
  t3_w = excluded.t3_w,
  t3_eer = excluded.t3_eer,
  equivalent_seer = excluded.equivalent_seer,
  surveyed_unit_description = excluded.surveyed_unit_description,
  equivalent_ac_model_description = excluded.equivalent_ac_model_description
where (t.make, t.compressor_type, t.size_category, t.tr, t.t1_btu, t.t1_w, t.t1_eer, t.t3_btu, t.t3_w, t.t3_eer, t.equivalent_seer, t.surveyed_unit_description, t.equivalent_ac_model_description)
   is distinct from (excluded.make, excluded.compressor_type, excluded.size_category, excluded.tr, excluded.t1_btu, excluded.t1_w, excluded.t1_eer, excluded.t3_btu, excluded.t3_w, excluded.t3_eer, excluded.equivalent_seer, excluded.surveyed_unit_description, excluded.equivalent_ac_model_description);

-- >>> CHUNK 8/11 — old_model_registry rows 1401-1516 of 1516
insert into public.old_model_registry as t (equipment_type, make, model_no, compressor_type, size_category, tr, t1_btu, t1_w, t1_eer, t3_btu, t3_w, t3_eer, equivalent_seer, surveyed_unit_description, equivalent_ac_model_description) values
('Split_Ceiling_Cassette','Zamil','KYA048H','Non-Inverter','4',null,null,null,null,null,null,null,null,null,'Split_Ceiling_Cassette LG 4.21TR SEER 7.69'),
('Split_Ceiling_Cassette','LG','LS-C382NMM0','Non-Inverter','3',3.16,38000,3970,9.57,null,null,null,null,null,'Split_Ceiling_Cassette Carrier 2.88TR SEER 10.05'),
('Split_Ceiling_Cassette','Classic','CRC24CDAHIKDA','Non-Inverter','2',null,null,null,null,null,null,null,null,null,'Split_Ceiling_Cassette Carrier 1.97TR SEER 10.37'),
('Split_Ceiling_Cassette','LG','ATUQ24GNLT0','Inverter','2',2,24000,2070,11.59,19900,2070,9.6135265700483092,10.19,'Split_Ceiling_Cassette LG 2TR SEER 10.19','Inverter unit "No replacement"'),
('Split_Ceiling_Cassette','GREE','GUTD24W/A-S(S)','Inverter','2',null,null,null,null,null,null,null,null,null,'Inverter unit "No replacement"'),
('Split_Ceiling_Cassette','GREE','GUTD36W/A-S(S)','Inverter','3',null,null,null,null,null,null,null,null,null,'Inverter unit "No replacement"'),
('Split_Ceiling_Cassette','LG','ATUW18GPLT2','Inverter','1.5',1.5,18000,1450,12.41,16200,1800,9,10.62,'Split_Ceiling_Cassette LG 1.5TR SEER 10.62','Inverter unit "No replacement"'),
('Split_Floor_Standing','Samsung','AP500PF','Non-Inverter','3.5',3.3,39683,5300,7.48,null,null,null,null,'Split_Floor_Standing Samsung 3.3TR SEER -','Split_Floor_Standing LG 3.33TR SEER 8.08'),
('Split_Floor_Standing','Hisense','AUF60COIN','Inverter','4.5',4.41,53000,4344,12.2,null,null,null,null,'Split_Floor_Standing Hisense 4.41TR SEER -','Inverter unit "No replacement"'),
('Split_Floor_Standing','Craft','DS60FE7HS7FHM','Non-Inverter','4.5',4.3899999999999997,52746,4404,11.97,45826,5454,8.4022735606894017,10.119999999999999,'Split_Floor_Standing Craft 4.39TR SEER 10.12','Split_Floor_Standing Zamil 4.421TR SEER 10.15'),
('Split_Floor_Standing','Kelvinator','FS-060H','Non-Inverter','4',3.84,46089,5470,8.42,42334,6380,6.6354231974921634,7.38,'Split_Floor_Standing Kelvinator 3.84TR SEER 7.38','Split_Floor_Standing LG 3.75TR SEER 7.47'),
('Split_Floor_Standing','Ugine','KT3F-70L','Non-Inverter','2',1.99,23898,3200,7.46,null,null,null,null,'Split_Floor_Standing Ugine 1.99TR SEER -','No Equivalent Found provide Pic & Datasheets'),
('Split_Wall_Mounted','Trane','4MWWCA12T1000AA','Non-Inverter','1',0.99,11900,1010,11.78,10100,1210,8.3471074380165291,9.9700000000000006,'Split_Wall_Mounted Trane 0.99TR SEER 9.97','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Trane','4MWWCA18T1000AA','Non-Inverter','1.5',1.51,18200,1560,11.66,16200,1850,8.7567567567567561,10.06,'Split_Wall_Mounted Trane 1.51TR SEER 10.06','Split_Wall_Mounted GREE 1.5TR SEER 9.98'),
('Split_Wall_Mounted','Trane','4MWWCA24T1000AA','Non-Inverter','2',1.93,23202,2000,11.6,19899,2390,8.325941422594143,9.86,'Split_Wall_Mounted Trane 1.93TR SEER 9.86','Split_Wall_Mounted LG 1.74TR SEER 9.84'),
('Split_Wall_Mounted','Trane','4MWWCA30T1000AA','Non-Inverter','2.5',2.31,27800,2310,12.03,24200,2740,8.8321167883211675,10.3,'Split_Wall_Mounted Trane 2.31TR SEER 10.3','Split_Wall_Mounted Zamil 2.24TR SEER 10.35'),
('Split_Wall_Mounted','Trane','4MWWCA36T1000AA','Non-Inverter','2.5',2.69,32300,2710,11.91,27700,3230,8.575851393188854,10.14,'Split_Wall_Mounted Trane 2.69TR SEER 10.14','Split_Wall_Mounted Royal Temp 2.67TR SEER 7.44'),
('Split_Wall_Mounted','Ravo','AC-RAV24CC','Non-Inverter','2',1.79,21495,1800,11.94,18425,2150,8.5697674418604652,10.15,'Split_Wall_Mounted Ravo 1.79TR SEER 10.15','Split_Wall_Mounted Carrier 1.84TR SEER 10.16'),
('Split_Wall_Mounted','Classic','ADO36CCXCD','Non-Inverter','2.5',2.61,31400,2573,12.2,null,null,null,null,'Split_Wall_Mounted Classic 2.61TR SEER -','Split_Wall_Mounted LG 2.5TR SEER 10.43'),
('Split_Wall_Mounted','Mando','F22M-24CT','Non-Inverter','2',1.87,22500,1899,11.84,19300,2311,8.3513630463003032,10.02,'Split_Wall_Mounted Mando 1.87TR SEER 10.02','Split_Wall_Mounted Carrier 1.83TR SEER 10.08'),
('Split_Wall_Mounted','Gibson','GS24CH','Non-Inverter','2',1.75,21040,1815,11.59,17060,2055,8.3017031630170308,9.8000000000000007,'Split_Wall_Mounted Gibson 1.75TR SEER 9.8','Split_Wall_Mounted LG 1.82TR SEER 9.79'),
('Split_Wall_Mounted','Zamil','HRZ18CDBCIRDK','Non-Inverter','1.5',1.5,18000,1481,12.15,15400,1800,8.5555555555555554,10.27,'Split_Wall_Mounted Zamil 1.5TR SEER 10.27','Split_Wall_Mounted Cooline 1.5TR SEER 10.25'),
('Split_Wall_Mounted','Mando','MP920-30H','Non-Inverter','2.5',2.25,27000,2177,12.4,null,null,null,null,'Split_Wall_Mounted Mando 2.25TR SEER -','Split_Wall_Mounted Gree 2.25TR SEER 11.11'),
('Split_Wall_Mounted','Midea','MSTG-24HR-19','Non-Inverter','2',1.84,22191,2438,9.1,null,null,null,null,'Split_Wall_Mounted Midea 1.84TR SEER -','Split_Wall_Mounted Carrier 2TR SEER 8.60'),
('Split_Wall_Mounted','Toshiba','RAV-181K2B','Non-Inverter','1.5',1.42,17070,null,null,null,null,null,null,'Split_Wall_Mounted Toshiba 1.42TR SEER -','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','Toshiba','RAV-241K2B','Non-Inverter','2',1.9,22874,null,null,null,null,null,null,'Split_Wall_Mounted Toshiba 1.9TR SEER -','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Toshiba','RAV-457KEE2BD','Non-Inverter','1.5',1.5,18000,null,null,null,null,null,null,'Split_Wall_Mounted Toshiba 1.5TR SEER -','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','Toshiba','RAV-717KEE2BD','Non-Inverter','2',2,24000,null,null,null,null,null,null,'Split_Wall_Mounted Toshiba 2TR SEER -','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Fuji','RSA24FMTA-S','Non-Inverter','2',1.88,22600,1960,11.53,19500,2350,8.2978723404255312,9.81,'Split_Wall_Mounted Fuji 1.88TR SEER 9.81','Split_Wall_Mounted LG 1.99TR SEER 9.80'),
('Split_Wall_Mounted','Speed_Cool','SCIT24H','Non-Inverter','2',1.68,20279,2628,7.71,null,null,null,null,'Split_Wall_Mounted Speed_Cool 1.68TR SEER -','Split_Wall_Mounted Daikin 1.55TR SEER 7.08'),
('Split_Wall_Mounted','Soft power','SFP-T-24KC19','Non-Inverter','2',1.75,21000,1721,12.2,null,null,null,null,'Split_Wall_Mounted Soft power 1.75TR SEER -','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','TCL','TAC-24CS/E7','Non-Inverter','2',1.75,21040,1815,11.59,null,null,null,null,'Split_Wall_Mounted TCL 1.75TR SEER -','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Zamil','TDZ24CCXRD','Non-Inverter','2',1.91,23000,null,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.91TR SEER -','Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Smart_Electric','WAL30-C-INA1','Inverter','2.5',2.33,28000,2231,12.55,null,null,null,null,'Split_Wall_Mounted Smart_Electric 2.33TR SEER -','Inverter unit "No replacement"'),
('Window','Rowa','024E8Y','Non-Inverter','2',2,24000,3200,7.5,null,null,null,null,'Window Rowa 2TR SEER -','Window LG 2TR SEER 7.48'),
('Window','Classic','ACB19CTXQIMNW','Non-Inverter','1.5',1.54,18500,2260,8.18,14500,2630,5.5133079847908748,6.79,'Window Classic 1.54TR SEER 6.79','Window  Zamil 1.5TR SEER 6.80'),
('Window','Gibson','AO24E8Y','Non-Inverter','2',2,24000,3200,7.5,null,null,null,null,'Window Gibson 2TR SEER -','Window LG 2TR SEER 7.48'),
('Window','General','AXSA18AATH','Non-Inverter','1.5',1.5,18100,2200,8.2200000000000006,null,null,null,null,'Window General 1.5TR SEER -','Window Carrier 1.43TR SEER 8.52'),
('Window','BASIC','BWAC-H18CF','Non-Inverter','1.5',1.5,18000,null,null,null,null,null,8.65,'Window BASIC 1.5TR SEER 8.65','Window Carrier 1.5TR SEER 8.62'),
('Window','Champion','CHVR243M-OS','Non-Inverter','2',1.83,22000,2600,8.4600000000000009,18504,3100,5.9690322580645159,7.15,'Window Champion 1.83TR SEER 7.15','Window Zamil 2TR SEER 7.20'),
('Window','Carrier','CR3M-24H','Non-Inverter','2',2,24000,2860,8.39,null,null,null,null,'Window Carrier 2TR SEER -','Window LG 2TR SEER 7.48'),
('Window','Carrier','CRVD243M-0B5','Non-Inverter','2',2,24050,2813,8.5399999999999991,18982,3089,6.1450307542894143,7.22,'Window Carrier 2TR SEER 7.22','Window  Zamil 2TR SEER 7.22'),
('Window','Falcon','FQSR183M-OM','Non-Inverter','1.5',1.5,18000,2200,8.18,null,null,null,null,'Window Falcon 1.5TR SEER -','Window Carrier 1.43TR SEER 8.52'),
('Window','Classic','HHB19CKEFINNW','Non-Inverter','1.5',1.54,18500,1814,10.19,14500,1986,7.3011077542799594,8.6,'Window Classic 1.54TR SEER 8.6','Window Carrier 1.5TR SEER 8.62'),
('Window','York','NYTH19R06','Non-Inverter','1.5',1.5,18000,2200,8.18,null,null,null,null,'Window York 1.5TR SEER -','Window Carrier 1.5TR SEER 8.62'),
('Window','York','NYTH24','Non-Inverter','2',2,24000,null,null,null,null,null,null,'Window York 2TR SEER -','Window  Zamil 2TR SEER 6.23'),
('Window','SANIYO','SA185BME6','Non-Inverter','1.5',1.5,18000,2620,6.87,null,null,null,null,'Window SANIYO 1.5TR SEER -','Window Carrier 1.5TR SEER 8.62'),
('Window','Zamil','SCB18CRXYIINW','Non-Inverter','1.5',1.5,18000,2200,8.18,12500,2300,5.4347826086956523,6.71,'Window Zamil 1.5TR SEER 6.71','Window  Zamil 1.5TR SEER 6.80'),
('Window','Ugine','UAWM18C','Non-Inverter','1.5',1.48,17800,1745,10.199999999999999,null,null,null,null,'Window Ugine 1.48TR SEER -','Window Carrier 1.5TR SEER 8.62'),
('Window','Ugine','UAWMS24C','Non-Inverter','2',1.75,21000,null,null,null,null,null,8.65,'Window Ugine 1.75TR SEER 8.65','Window York  1.75TR SEER 8.45'),
('Window','HEAVY DUTY','WRC 1834K2S','Non-Inverter','1.5',1.5,18000,null,null,null,null,null,null,'Window HEAVY DUTY 1.5TR SEER -','Window Carrier 1.5TR SEER 8.62'),
('Window','White Westinghouse','WWA20G8NR','Non-Inverter','1.5',1.5,18000,1756,10.25,null,null,null,null,'Window White Westinghouse 1.5TR SEER -','Window Carrier 1.5TR SEER 8.62'),
('Window','Zamil','ZCM24CGXFMNNW1','Non-Inverter','2',1.75,21000,2058,10.199999999999999,17800,2438,7.3010664479081218,8.66,'Window Zamil 1.75TR SEER 8.66','Window York  1.75TR SEER 8.45'),
('Split_Wall_Mounted','Midea','MSTMXV12HRN1AG1','Inverter','1',1,12000,null,null,null,null,null,null,null,'Inverter unit "No replacement"'),
('Split_Wall_Mounted','Midea','MSTMXV18HRN2AG1','Inverter','1.5',1.5,18000,null,null,null,null,null,null,null,'Inverter unit "No replacement"'),
('Split_Wall_Mounted','Midea','MSTMXV24HRN1AG1','Inverter','2',2,24000,null,null,null,null,null,null,null,'Inverter unit "No replacement"'),
('Split_Wall_Mounted','Midea','MSTMXV30HRN1AG1','Inverter','2.5',2.5,30000,null,null,null,null,null,null,null,'Inverter unit "No replacement"'),
('Split_Wall_Mounted','Midea','MSTMXV36HRNMB','Inverter','3',3,36000,null,null,null,null,null,null,null,'Inverter unit "No replacement"'),
('Split_Ceiling_Cassette','Midea','MCCTV18HRN2','Inverter','1.5',1.5,18000,null,null,null,null,null,null,null,'Inverter unit "No replacement"'),
('Split_Ceiling_Cassette','Midea','MCCTV24HRN3','Inverter','2',2,24000,null,null,null,null,null,null,null,'Inverter unit "No replacement"'),
('Split_Ceiling_Cassette','Midea','MCCTV30HRN1','Inverter','2.5',2.5,30000,null,null,null,null,null,null,null,'Inverter unit "No replacement"'),
('Split_Floor_Standing','Midea','MFTGAV50CRN','Inverter','4',4.16,50000,null,null,null,null,null,null,null,'Inverter unit "No replacement"'),
('Split_Floor_Standing','Midea','MFTGAV50HRN2','Inverter','4',4.16,50000,null,null,null,null,null,null,null,'Inverter unit "No replacement"'),
('Window','ALTO','AAN 19CR-5','Non-Inverter','1.5',1.5,18000,2200,8.18,null,null,null,null,null,'Window Carrier 1.43TR SEER 8.52'),
('Window','Zamil','ACB19CAXQIMNW','Non-Inverter','1.5',1.5,18000,2370,7.59,15000,2770,5.4151624548736459,6.43,'Window Zamil 1.5TR SEER 6.43','Window Zamil 1.5TR SEER 6.51'),
('Window','Zamil','AHB19CEDW','Non-Inverter','1.5',1.5,18000,2100,8.57,15000,2370,6.3291139240506329,7.32,'Window Zamil 1.5TR SEER 7.32','Window LG 1.49TR SEER 7.24'),
('Window','Zamil','AHB19CREPIINW','Non-Inverter','1.5',1.54,18500,2200,8.4,13500,2250,6,7.05,'Window Zamil 1.54TR SEER 7.05','Window LG 1.39TR SEER 7.03'),
('Window','Zamil','AHB24CREPIINW','Non-Inverter','2',2,24000,2800,8.57,18000,3100,5.806451612903226,7.1,'Window Zamil 2TR SEER 7.1','Window Zamil 2TR SEER 7.10'),
('Window','SAMSUNG','AHT18F1HBB','Non-Inverter','1.5',1.5,18000,2050,8.7799999999999994,14484,2200,6.583636363636364,7.51,'Window SAMSUNG 1.5TR SEER 7.51','Window LG 1.5TR SEER 7.70'),
('Window','SAMSUNG','AHT18WIE','Non-Inverter','1.5',1.5,18000,2200,8.18,14490,2550,5.6823529411764708,6.86,'Window SAMSUNG 1.5TR SEER 6.86','Window Samsung 1.5TR SEER 6.82'),
('Window','HISENSE','AW17HT','Non-Inverter','1.5',1.41,17000,1626,10.45,null,null,null,null,null,'Window Carrier 1.5TR SEER 8.62'),
('Window','FUJITSU','AXS18RANHW','Non-Inverter','1.5',1.5,18000,2180,8.25,13648,2570,5.3105058365758753,6.75,'Window FUJITSU 1.5TR SEER 6.75','Window  Zamil 1.5TR SEER 6.80'),
('Window','Carrier','C2K24HMB','Non-Inverter','2',2,24000,2800,8.57,18698,3000,6.2326666666666668,7.26,'Window Carrier 2TR SEER 7.26','Window Zamil 2TR SEER 7.24'),
('Window','Carrier','CR18HK5','Non-Inverter','1.5',1.33,16000,2200,7.27,null,null,null,null,null,'Window LG 1.39TR SEER 7.03'),
('Window','Carrier','CR3M-18HK5','Non-Inverter','1.5',1.5,18000,2200,8.18,null,null,null,null,null,'Window Carrier 1.43TR SEER 8.52'),
('Window','CARRIER','CRSD243M-0B5','Non-Inverter','2',2,24050,2813,8.5399999999999991,19000,3089,6.1508578828099711,7.23,'Window CARRIER 2TR SEER 7.23','Window Zamil 2TR SEER 7.24'),
('Window','LG','D182EH SN2','Non-Inverter','1.5',1.51,18200,1785,10.19,15200,2117,7.1799716580066129,8.6,'Window LG 1.51TR SEER 8.6','Window Carrier 1.5TR SEER 8.62'),
('Window','DAEWOO','DWA-181C','Non-Inverter','1.5',1.5,18000,2150,8.3699999999999992,14330,2600,5.5115384615384615,6.91,'Window DAEWOO 1.5TR SEER 6.91','Window  Zamil 1.5TR SEER 6.92'),
('Window','Falcon','FCRL3-18HK5','Non-Inverter','1.5',1.5,18000,2200,8.18,null,null,null,null,null,'Window Carrier 1.43TR SEER 8.52'),
('Window','GENERAL','GS 1819C','Non-Inverter','1.5',1.41,17000,1650,10.3,null,null,null,null,null,'Window Carrier 1.5TR SEER 8.62'),
('Window','GENERAL','GS 2430C','Non-Inverter','2',1.83,22000,2156,10.199999999999999,null,null,null,null,null,'Window York  1.75TR SEER 8.45'),
('Window','HISENSE','HW18CA23','Non-Inverter','1.5',1.5,18000,null,null,null,null,null,8.65,'Window HISENSE 1.5TR SEER 8.65','Window Zamil 1.5TR SEER 6.51'),
('Window','Zamil','LHB19CTECIING','Non-Inverter','1.5',1.5,18000,2150,8.3699999999999992,13750,2350,5.8510638297872344,7,'Window Zamil 1.5TR SEER 7','Window LG 1.39TR SEER 7.03'),
('Window','YORK','LRC 24H06','Non-Inverter','2',2,24000,3200,7.5,null,null,null,null,null,'Window LG 2TR SEER 7.48'),
('Window','LG','LWH182MGABO','Non-Inverter','1.5',1.5,18000,2020,8.91,null,null,null,null,null,'Window Carrier 1.5TR SEER 8.62'),
('Window','LG','LWM1820BHP','Non-Inverter','1.5',1.5,18000,2020,8.91,null,null,null,null,null,'Window Carrier 1.5TR SEER 8.62'),
('Window','Zamil','MH1950FA','Non-Inverter','1.5',1.62,19500,null,null,15100,null,null,null,null,'Window Zamil 1.5TR SEER 6.51'),
('Window','LG','W182EH SA0','Non-Inverter','1.5',1.5,18000,2120,8.49,13307,2390,5.5677824267782423,6.97,'Window LG 1.5TR SEER 6.97','Window  Zamil 1.5TR SEER 6.92'),
('Window','LG','W182EH SN0','Non-Inverter','1.5',1.39,16719,2000,8.35,13478,2290,5.8855895196506554,7.03,'Window LG 1.39TR SEER 7.03','Window LG 1.39TR SEER 7.03'),
('Window','LG','W182EH SN2','Non-Inverter','1.5',1.39,16719,2050,8.15,13990,2350,5.9531914893617017,6.95,'Window LG 1.39TR SEER 6.95','Window LG 1.39TR SEER 7.03'),
('Window','WHITE','WWA25G6HR','Non-Inverter','2',1.79,21500,2130,10.09,17900,2510,7.1314741035856573,8.52,'Window WHITE 1.79TR SEER 8.52','Window York  1.75TR SEER 8.45'),
('Window','LG','Z182EH SN4','Non-Inverter','1.5',1.49,17948,2110,8.5,15116,2460,6.1447154471544714,7.23,'Window LG 1.49TR SEER 7.23','Window LG 1.49TR SEER 7.24'),
('Window','Zamil','ZHB18CAEQMNW','Non-Inverter','1.5',1.45,17500,2330,7.51,14500,2630,5.5133079847908748,6.4,'Window Zamil 1.45TR SEER 6.4','Window Zamil 1.5TR SEER 6.51'),
('Window','Zamil','ZHB18CAETIMNW','Non-Inverter','1.5',1.5,18000,1857,9.69,15000,2149,6.9799906933457425,8.23,'Window Zamil 1.5TR SEER 8.23','Window Carrier 1.43TR SEER 8.52'),
('Window','Zamil','ZHB18CTEYIMNW','Non-Inverter','1.5',1.5,18000,2250,8,13500,2650,5.0943396226415096,6.52,'Window Zamil 1.5TR SEER 6.52','Window Zamil 1.5TR SEER 6.51'),
('Window','Zamil','ZHB24CTEYIMNW','Non-Inverter','2',2,24000,2740,8.75,18000,3200,5.625,7.16,'Window Zamil 2TR SEER 7.16','Window Zamil 2TR SEER 7.20'),
('Split_Wall_Mounted','LG','LO242H0','Non-Inverter','2',1.87,22500,1815,12.39,19300,2218,8.7015329125338141,10.47,'Split_Wall_Mounted LG 1.87TR SEER 10.47','Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','LG','S242 NH STG','Non-Inverter','2',1.91,22997,2630,8.74,20063,3035,6.6105436573311369,7.54,'Split_Wall_Mounted LG 1.91TR SEER 7.54','Split_Wall_Mounted LG 1.91TR SEER 7.54'),
('Split_Wall_Mounted','Coolsense','AAMJCSP18SAH','Non-Inverter','1.5',1.5,18000,1450,12.41,15900,1740,9.137931034482758,10.65,'Split_Wall_Mounted Coolsense 1.5TR SEER 10.65','Split_Wall_Mounted Zamil 1.49TR SEER 10.52'),
('Split_Wall_Mounted','SAMSUNG','A18TUNN','Non-Inverter','1.5',1.5,18000,1900,9.4700000000000006,null,null,null,null,null,'Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','SAMSUNG','AS36UGBN','Non-Inverter','2.5',2.75,33000,3800,8.68,28175,3950,7.1329113924050631,7.64,'Split_Wall_Mounted SAMSUNG 2.75TR SEER 7.64','Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53'),
('Split_Wall_Mounted','LG','B1824H N50','Non-Inverter','2',1.45,17503,1520,11.51,15184,1830,8.2972677595628408,9.8000000000000007,'Split_Wall_Mounted LG 1.45TR SEER 9.8','Split_Wall_Mounted LG 1.46TR SEER 9.8'),
('Split_Wall_Mounted','LG','B1824H N51','Non-Inverter','2',1.45,17469,1510,11.56,14978,1800,8.3211111111111116,9.84,'Split_Wall_Mounted LG 1.45TR SEER 9.84','Split_Wall_Mounted LG 1.45TR SEER 9.84'),
('Split_Wall_Mounted','MANDO','F22M-18HT','Non-Inverter','1.5',1.51,18200,1517,11.99,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','MANDO','F22M-24HT','Non-Inverter','2',1.87,22500,1899,11.84,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','MANDO','F23TP-18HT','Non-Inverter','1.5',1.51,18200,1517,11.99,null,null,null,10.199999999999999,'Split_Wall_Mounted MANDO 1.51TR SEER 10.2','Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','Mando','F23TP-24HT','Non-Inverter','2',1.87,22500,1899,11.84,null,null,null,null,null,'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43'),
('Split_Wall_Mounted','Falcon','FQS18C6','Non-Inverter','1.5',1.42,17100,1380,12.39,14500,1665,8.7087087087087092,10.46,'Split_Wall_Mounted Falcon 1.42TR SEER 10.46','Split_Wall_Mounted LG 1.5TR SEER 10.46'),
('Split_Wall_Mounted','Falcon','FTS18C4','Non-Inverter','1.5',1.5,18000,null,null,null,null,null,10.199999999999999,'Split_Wall_Mounted Falcon 1.5TR SEER 10.2','Split_Wall_Mounted LG 1.41TR SEER 6.94'),
('Split_Wall_Mounted','Falcon','HBPUC 24','Non-Inverter','2',2,24000,3000,8,null,null,null,null,null,'Split_Wall_Mounted Carrier 1.81TR SEER 7.91'),
('Split_Wall_Mounted','YORK','HTKA24OS-ADR','Non-Inverter','2',2,24000,null,null,null,null,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','Kelvinator','HBPUDC24','Non-Inverter','2',2,24000,null,null,null,null,null,null,null,'Split_Wall_Mounted Zamil 2TR SEER 6.69'),
('Split_Wall_Mounted','AKAI','AS13UXIH','Non-Inverter','1',1,12000,1020,11.76,10600,1260,8.412698412698413,10.1,'Split_Wall_Mounted AKAI 1TR SEER 10.1','Split_Wall_Mounted Carrier 0.96TR SEER 10.37'),
('Split_Wall_Mounted','Zamil','HWX30EHAYFR','Non-Inverter','2.5',2.21,26594,3020,8.8000000000000007,21994,3500,6.2839999999999998,7.45,'Split_Wall_Mounted Zamil 2.21TR SEER 7.45','Split_Wall_Mounted LG 2.21TR SEER 7.49'),
('Split_Wall_Mounted','Comfort Line','MSAC-18CS/XT7','Non-Inverter','1.5',1.5,18000,1524,11.81,null,null,null,null,null,'Split_Wall_Mounted Zamil 1.49TR SEER 10.96'),
('Split_Wall_Mounted','LG','S182SH N52','Non-Inverter','1.5',1.41,17026,2100,8.1,14672,2450,5.9885714285714284,6.95,'Split_Wall_Mounted LG 1.41TR SEER 6.95','Split_Wall_Mounted LG 1.41TR SEER 6.94')
on conflict (equipment_type, model_no) do update set
  make = excluded.make,
  compressor_type = excluded.compressor_type,
  size_category = excluded.size_category,
  tr = excluded.tr,
  t1_btu = excluded.t1_btu,
  t1_w = excluded.t1_w,
  t1_eer = excluded.t1_eer,
  t3_btu = excluded.t3_btu,
  t3_w = excluded.t3_w,
  t3_eer = excluded.t3_eer,
  equivalent_seer = excluded.equivalent_seer,
  surveyed_unit_description = excluded.surveyed_unit_description,
  equivalent_ac_model_description = excluded.equivalent_ac_model_description
where (t.make, t.compressor_type, t.size_category, t.tr, t.t1_btu, t.t1_w, t.t1_eer, t.t3_btu, t.t3_w, t.t3_eer, t.equivalent_seer, t.surveyed_unit_description, t.equivalent_ac_model_description)
   is distinct from (excluded.make, excluded.compressor_type, excluded.size_category, excluded.tr, excluded.t1_btu, excluded.t1_w, excluded.t1_eer, excluded.t3_btu, excluded.t3_w, excluded.t3_eer, excluded.equivalent_seer, excluded.surveyed_unit_description, excluded.equivalent_ac_model_description);

-- --------------------------------------------------------------------------
-- approved_baseline_units — 194 rows from AC template / Aprvd Baseline Unit
-- --------------------------------------------------------------------------
-- >>> CHUNK 9/11 — approved_baseline_units rows 1-194 of 194
insert into public.approved_baseline_units as t (description, equipment_type, make, model_no, t1_btu, t1_w, t1_eer, t3_btu, t3_w, t3_eer, equivalent_seer, nameplate_ref, datasheet_ref) values
('Split_Wall_Mounted LG 0.95TR SEER 7.9','Split_Wall_Mounted','LG','S122DH',11498,1200,9.58,8871,1400,6.34,7.9,'Same as description','Same as description'),
('Split_Wall_Mounted LG 0.95TR SEER 8.3','Split_Wall_Mounted','LG','S122SH / GS-H122E0B1',11498.436167187945,1200,9.58,10235.996588001137,1400,7.31,8.3000000000000007,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 0.96TR SEER 10.37','Split_Wall_Mounted','Carrier','42QHF012H',11500,940,12.23,9700,1110,8.74,10.37,'Same as description','Same as description'),
('Split_Wall_Mounted Royal Temp 1TR SEER 6.59','Split_Wall_Mounted','Royal Temp','MIS-120-C',12000,1518,7.91,9480,1755,5.4,6.59,'Same as description','Same as description'),
('Split_Ceiling_Cassette Carrier 1.33TR SEER 10.51','Split_Ceiling_Cassette','Carrier','42KTD018HS',16000,1330,12.03,15000,1610,9.32,10.51,'Same as description','Same as description'),
('Split_Wall_Mounted Chigo 1.38TR SEER 9.88','Split_Wall_Mounted','Chigo','CZS-18CH',16675,1450,11.5,14362,1670,8.6,9.8800000000000008,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.41TR SEER 6.94','Split_Wall_Mounted','LG','S182DH',17025.874324708562,2100,8.11,14671.595109468297,2450,5.99,6.94,'Same as description','Same as description'),
('Split_Wall_Mounted York 1.42TR SEER 9.83','Split_Wall_Mounted','York','YE6HC18SH/YE6SD180SHZW41',17040,1478,11.53,15097,1819,8.3000000000000007,9.83,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.45TR SEER 9.84','Split_Wall_Mounted','LG','B1828H N51',17469.434176855277,1510,11.57,14978.675007108332,1800,8.32,9.84,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.46TR SEER 7.56','Split_Wall_Mounted','LG','S182DC u51',17500,2000,8.75,15300,2300,6.65,7.56,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.46TR SEER 7.28','Split_Wall_Mounted','LG','S182SC / LSUC1825SB0',17503,2050,8.5399999999999991,15183,2450,6.2,7.28,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.46TR SEER 7.57','Split_Wall_Mounted','LG','S182DC N51',17503.554165481946,2000,8.75,15353.994882001707,2300,6.68,7.57,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.46TR SEER 9.8','Split_Wall_Mounted','LG','A1828P nco',17503.554165481946,1520,11.52,15012.794995735005,1810,8.2899999999999991,9.8000000000000007,'Same as description','Same as description'),
('Split_Wall_Mounted Zamil 1.47TR SEER 9.8','Split_Wall_Mounted','Zamil','ADO18CHXOW',17698.038100653968,1532,11.55,14797.839067386978,1783,8.3000000000000007,9.8000000000000007,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.47TR SEER 10.15','Split_Wall_Mounted','LG','T182NC NC0 / LS Q182CNC0',17742,1500,11.83,15286,1740,8.7899999999999991,10.15,'Same as description','Same as description'),
('Split_Wall_Mounted Ugine 1.48TR SEER 10.23','Split_Wall_Mounted','Ugine','UASG18H',17800,1465,12.15,14500,1696,8.5500000000000007,10.23,'Same as description','Same as description'),
('Split_Wall_Mounted Zamil 1.49TR SEER 10.52','Split_Wall_Mounted','Zamil','MAZ18CCXAD1',17998.294000568669,1440,12.5,15899.914700028436,1849,8.6,10.52,'Same as description','Same as description'),
('Split_Wall_Mounted Zamil 1.49TR SEER 10.96','Split_Wall_Mounted','Zamil','ADO18CHX0D',17998.294000568669,1379,13.05,15295.990901336367,1700,9,10.96,'Same as description','Same as description'),
('Split_Ceiling_Cassette LG 1.5TR SEER 8.05','Split_Ceiling_Cassette','LG','LT-C182ELE0',18000,1970,9.14,16002.274665908448,2150,7.44,8.0500000000000007,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.5TR SEER 10.46','Split_Wall_Mounted','LG','NF182H2',18000,1452,12.4,15300,1759,8.6999999999999993,10.46,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.5TR SEER 8.40','Split_Wall_Mounted','LG','LS-H182TNB0',18000,1860,9.68,16002.274665908448,2150,7.44,8.4,'Same as description','Same as description'),
('Split_Wall_Mounted General 1.5TR SEER 10.16','Split_Wall_Mounted','General','GC-18KFC',18000,1500,12,15500,1824,8.5,10.16,'Same as description','Same as description'),
('Split_Wall_Mounted Mando 1.5TR SEER 10.35','Split_Wall_Mounted','Mando','MP-SER-18C',18000,1469,12.25,15500,1802,8.6,10.35,'Same as description','Same as description'),
('Split_Wall_Mounted Unix 1.5TR SEER 10.16','Split_Wall_Mounted','Unix','Omr/split 18H',18000,1500,12,15500,1824,8.5,10.16,'Same as description','Same as description'),
('Split_Wall_Mounted GREE 1.5TR SEER 9.98','Split_Wall_Mounted','GREE','GWC18QD-D3NTB4D/I',18000,1525,11.8,14900,1773,8.4,9.98,'Same as description','Same as description'),
('Split_Wall_Mounted Royal Temp 1.5TR SEER 7.67','Split_Wall_Mounted','Royal Temp ','MIS-180-HP',18000,2045,8.8000000000000007,15732,2280,6.9,7.67,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 1.5TR SEER 10.95','Split_Wall_Mounted','Carrier','42SXC180',18000,1379,13.05,15000,1667,9,10.95,'Same as description','Same as description'),
('Split_Wall_Mounted Gree 1.5TR SEER 7.03','Split_Wall_Mounted','Gree','GWC18MC',18083,2250,8.0399999999999991,16200,2550,6.35,7.03,'Same as description','Same as description'),
('Split_Wall_Mounted Cooline 1.5TR SEER 10.25','Split_Wall_Mounted','Cooline','TAL18CHXED',18100,1496,12.1,15470,1800,8.59,10.25,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.52TR SEER 8.15','Split_Wall_Mounted','LG','Y182SH / GS-H1825SA4',18254.193915268694,1900,9.61,15183.394938868356,2200,6.9,8.15,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.52TR SEER 8.15','Split_Wall_Mounted','LG','Y182NH / GS-H1825SA4',18254.193915268694,1900,9.61,15183.394938868356,2200,6.9,8.15,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.53TR SEER 8.30','Split_Wall_Mounted','LG','S18TQC / HSNC186C4B0',18400,1919,9.59,16200,2218,7.3,8.3000000000000007,'Same as description','Same as description'),
('Split_Wall_Mounted Mando 1.53TR SEER 10.38','Split_Wall_Mounted','Mando','F23TP-18CT',18400,1484,12.4,15300,1800,8.5,10.38,'Same as description','Same as description'),
('Split_Wall_Mounted Okia 1.53TR SEER 10.37','Split_Wall_Mounted','Okia','OKA-18CJ',18400,1510,12.19,15800,1800,8.7799999999999994,10.37,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.54TR SEER 8.14','Split_Wall_Mounted','LG','Y182SC / GS-C1825SA4',18561,1950,9.52,16036,2300,6.97,8.14,'Same as description','Same as description'),
('Split_Wall_Mounted Daikin 1.55TR SEER 7.08','Split_Wall_Mounted','Daikin','RY18HEVLK / FTY18HEVLK',18650,2260,8.25,16100,2630,6.12,7.08,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.74TR SEER 8.20','Split_Wall_Mounted','LG','Y242NH / GS-H2425SA4',20949.673016775661,2200,9.52,18254.193915268694,2550,7.16,8.1999999999999993,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.74TR SEER 9.84','Split_Wall_Mounted','LG','B2427H / DSNH24257B1',20949.673016775661,1820,11.51,18936.593687802106,2280,8.31,9.84,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.74TR SEER 9.84','Split_Wall_Mounted','LG','B2424H',20949.673016775661,1820,11.51,18936.593687802106,2280,8.31,9.84,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.75TR SEER 8.20','Split_Wall_Mounted','LG','Y242SH N54',20949.673016775661,2200,9.52,18254.193915268694,2550,7.16,8.1999999999999993,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.74TR SEER 8.17','Split_Wall_Mounted','LG','X242EC',20983.793005402335,2200,9.5399999999999991,18254.193915268694,2600,7.02,8.17,'Same as description','Same as description'),
('Split_Wall_Mounted Arrow 1.75TR SEER 10.39','Split_Wall_Mounted','Arrow','RO-24CBA22-H',21000,1710,12.28,17900,2060,8.69,10.39,'Same as description','Same as description'),
('Split_Wall_Mounted Giant 1.75TR SEER 10.36','Split_Wall_Mounted','Giant','GIANT-24C',21000,1750,12,18900,2100,9,10.36,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 1.75TR SEER 7.63','Split_Wall_Mounted','Carrier','38HQR24US30-04',21000,2400,8.75,18500,2700,6.85,7.63,'Same as description','Same as description'),
('Split_Ceiling_Cassette LG 1.75TR SEER 7.36','Split_Ceiling_Cassette','LG','LTNC242QLE0',21017.912994029,2470,8.51,18697.753767415412,2900,6.45,7.36,'Same as description','Same as description'),
('Split_Ceiling_Cassette Mitsubishi 1.76TR SEER 6.74','Split_Ceiling_Cassette','Mitsubishi','FDTN257HEPA',21154.392948535686,2680,7.89,17742.39408586864,3050,5.82,6.74,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.79TR SEER 7.34','Split_Wall_Mounted','LG','S242DC N51',21495.592834802388,2500,8.6,18765.993744668755,3000,6.26,7.34,'Same as description','Same as description'),
('Split_Wall_Mounted Crown 1.79TR SEER 10.33','Split_Wall_Mounted','Crown','CROWN 24C',21500,1770,12.15,18600,2130,8.73,10.33,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 1.79TR SEER 10.35','Split_Wall_Mounted','Carrier','38QKA0243',21500,1762,12.2,18500,2126,8.6999999999999993,10.35,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 1.79TR SEER 8.31','Split_Wall_Mounted','Carrier','38MQR18US33-04',21500,2240,9.6,19000,2600,7.31,8.31,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 1.81TR SEER 7.91','Split_Wall_Mounted','Carrier','38HKR24US30-04',21750,2400,9.06,19500,2750,7.09,7.91,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.82TR SEER 9.79','Split_Wall_Mounted','LG','B242PC',21870.912709695767,1900,11.51,18970.713676428772,2290,8.2799999999999994,9.7899999999999991,'Same as description','Same as description'),
('Split_Wall_Mounted Zamil 1.83TR SEER 7.51','Split_Wall_Mounted','Zamil','MLZ24CHIXFTR',21997.156667614447,2558,8.6,19499.573500142167,2868,6.8,7.51,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.83TR SEER 10.27','Split_Wall_Mounted','LG','NS242H2',22000,1818,12.1,18500,2127,8.6999999999999993,10.27,'Same as description','Same as description'),
('Split_Wall_Mounted Gree 1.83TR SEER 10.17','Split_Wall_Mounted','Gree','GWC24AGE-D3NTA1A/O',22000,1818,12.1,18300,2178,8.4,10.17,'Same as description','Same as description'),
('Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43','Split_Wall_Mounted','Supergeneral','KSGS245GER',22000,1781,12.35,18400,2114,8.6999999999999993,10.43,'Same as description','Same as description'),
('Split_Ceiling_Cassette LG 1.83TR SEER 10.59','Split_Ceiling_Cassette','LG','ATNQ24GPLT2',22000,1770,12.43,20000,2260,8.85,10.59,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 1.83TR SEER 10.08','Split_Wall_Mounted','Carrier','42SKC243-2S',22000,1833,12,18500,2229,8.3000000000000007,10.08,'Same as description','Same as description'),
('Split_Wall_Mounted Zamil 1.83TR SEER 10.42','Split_Wall_Mounted','Zamil','MAZ24CHXAD1',22000.568666477113,1781,12.35,18397.497867500715,2114,8.6999999999999993,10.42,'Same as description','Same as description'),
('Split_Wall_Mounted Mando 1.84TR SEER 10.28','Split_Wall_Mounted','Mando','MP-NF23-24C/H',22100,1804,12.25,18500,2189,8.4499999999999993,10.28,'Same as description','Same as description'),
('Split_Wall_Mounted Midea 1.84TR SEER 10.28','Split_Wall_Mounted','Midea','MSTEP24CRNAG2',22100,1804,12.25,18500,2189,8.4499999999999993,10.28,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 1.84TR SEER 10.16','Split_Wall_Mounted','Carrier','38HVBS024-3032B',22100,1830,12.08,19300,2320,8.32,10.16,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.87TR SEER 7.14','Split_Wall_Mounted','LG','S242SHU51',22519.192493602503,2640,8.5299999999999994,18936.593687802106,3250,5.83,7.14,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.91TR SEER 7.54','Split_Wall_Mounted','LG','S242MH',22996.87233437589,2630,8.74,20062.553312482229,3035,6.61,7.54,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.58TR SEER 7.54','Split_Wall_Mounted','LG','S242NH ST0',22996.87233437589,2630,8.74,20062.553312482229,3035,6.61,7.54,'Same as description','Same as description'),
('Split_Wall_Mounted Fisher 1.92TR SEER 10.16','Split_Wall_Mounted','Fisher','FSAC-FT24CERAN',23000,1917,12,19800,2329,8.5,10.16,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 1.92TR SEER 9.83','Split_Wall_Mounted','Carrier','38PQR24US33-08',23000,1991,11.55,20000,2410,8.3000000000000007,9.83,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 1.92TR SEER 9.83','Split_Wall_Mounted','Carrier','38PQS24US33-01',23000,1990,11.56,20000,2410,8.3000000000000007,9.83,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 1.92TR SEER 9.83','Split_Wall_Mounted','Carrier','42QHMT24N-308J',23000,1991,11.55,20000,2410,8.3000000000000007,9.83,'Same as description','Same as description'),
('Split_Ceiling_Cassette Zamil 1.94TR SEER 10.35','Split_Ceiling_Cassette','Zamil','SCZ24CHAXCD1',23300,1900,12.26,19800,2300,8.61,10.35,'Same as description','Same as description'),
('Split_Wall_Mounted Zamil 2TR SEER 6.69','Split_Wall_Mounted','Zamil','ADX24EHAXFQ',23491,2975,7.9,18994,3325,5.71,6.69,'Same as description','Same as description'),
('Split_Wall_Mounted Zamil 1.95TR SEER 8.11','Split_Wall_Mounted','Zamil','ADU24CHAXFV',23498.436167187945,2460,9.5500000000000007,20100.085299971568,2935,6.85,8.11,'Same as description','Same as description'),
('Split_Ceiling_Cassette Carrier 1.96TR SEER 10.25','Split_Ceiling_Cassette','Carrier','42KTD024HS',23500,1950,12.05,20000,2300,8.6999999999999993,10.25,'Same as description','Same as description'),
('Split_Ceiling_Cassette Carrier 1.97TR SEER 10.37','Split_Ceiling_Cassette','Carrier','42QTD024HSN',23600,1927,12.25,20000,2300,8.6999999999999993,10.37,'Same as description','Same as description'),
('Split_Ceiling_Cassette LG 1.99TR SEER 8.23','Split_Ceiling_Cassette','LG','LTNC242PLE1',23885,2500,9.5500000000000007,21667,3050,7.1,8.23,'Same as description','Same as description'),
('Split_Wall_Mounted LG 1.99TR SEER 9.80','Split_Wall_Mounted','LG','A3024HNV0',23986.352004549335,2080,11.53,20779.07307364231,2510,8.2799999999999994,9.8000000000000007,'Same as description','Same as description'),
('Split_Wall_Mounted Zamil 1.99TR SEER9.77','Split_Wall_Mounted','Zamil','ADO24CHXOW',23996.588001137334,2078,11.55,19299.075152000001,2325,8.3000000000000007,9.77,'Same as description','Same as description'),
('Split_Wall_Mounted Zamil 1.99TR SEER9.77','Split_Wall_Mounted','Zamil','KRC24CDMHJOW',23996.588001137334,2078,11.55,19298.265567244809,2325,8.3000000000000007,9.77,'Same as description','Same as description'),
('Split_Wall_Mounted LG 2TR SEER 7.91','Split_Wall_Mounted','LG','S242WQ / LSUH2425WM1',24000,2600,9.23,19653,2840,6.92,7.91,'Same as description','Same as description'),
('Split_Wall_Mounted DAEWOO 2TR SEER 7.86','Split_Wall_Mounted','DAEWOO','DSA-240LH-R',24000,2500,9.6,17496.730167756614,2800,6.25,7.86,'Same as description','Same as description'),
('Split_Ceiling_Cassette LG 2.0TR SEER 8.33','Split_Ceiling_Cassette','LG','LT-C242ELE0',24000,2500,9.6,21000,2830,7.42,8.33,'Same as description','Same as description'),
('Split_Wall_Mounted Royal Temp 2TR SEER 7.64','Split_Wall_Mounted','Royal Temp ','MIS-240-HP',24000,2727,8.8000000000000007,20064,2907,6.9,7.64,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 2TR SEER 8.60','Split_Wall_Mounted','Carrier','42QCF02433',24000,2450,9.8000000000000007,21000,2650,7.92,8.6,'Same as description','Same as description'),
('Split_Wall_Mounted Zamil 2TR SEER 10.39','Split_Wall_Mounted','Zamil','KRZ26CDACIED',24055,1935,12.43,19960,2353,8.48,10.39,'Same as description','Same as description'),
('Split_Ceiling_Cassette Mitsubishi 2.02TR SEER 6.93','Split_Ceiling_Cassette','Mitsubishi','FDTN306CEP',24225.191924936025,3030,8,19448.393517202163,3260,5.97,6.93,'Same as description','Same as description'),
('Split_Wall_Mounted MITSUBISHI 2.03TR SEER 7.10','Split_Wall_Mounted','MITSUBISHI','PK-2.5FLD',24400,3010,8.11,22700,3540,6.41,7.12,'Same as description','Same as description'),
('Split_Wall_Mounted Zamil 2.11TR SEER7.24','Split_Wall_Mounted','Zamil','MWZ30CHIXFTQ/KZC30CSIHAMCQ',25398.91953369349,3050,8.33,21997.156667614447,3375,6.52,7.24,'Same as description','Same as description'),
('Split_Wall_Mounted Zamil 2.12TR SEER 8.09','Split_Wall_Mounted','Zamil','HWU30EHAYFV',25497.867500710836,2670,9.5500000000000007,21099.800966733015,3080,6.85,8.09,'Same as description','Same as description'),
('Split_Wall_Mounted GREE 2.19TR SEER 10.05','Split_Wall_Mounted','GREE','GWC30QE-D3NTN4A/I',26300,2230,11.79,22800,2680,8.51,10.050000000000001,'Same as description','Same as description'),
('Split_Wall_Mounted LG 2.21TR SEER 7.49','Split_Wall_Mounted','LG','S322GH',26545.351151549617,3050,8.6999999999999993,23269.832243389254,3570,6.52,7.49,'Same as description','Same as description'),
('Split_Wall_Mounted LG 2.21TR SEER 8.14','Split_Wall_Mounted','LG','S3228Q / LS-H322V8C2',26613.59112880296,2790,9.5399999999999991,23713.392095535972,3450,6.87,8.14,'Same as description','Same as description'),
('Split_Wall_Mounted LG 2.22TR SEER 8.14','Split_Wall_Mounted','LG','S3224H NV2',26613.59112880296,2790,9.5399999999999991,23713.392095535968,3450,6.87,8.14,'Same as description','Same as description'),
('Split_Wall_Mounted Zamil 2.24TR SEER 10.35','Split_Wall_Mounted','Zamil','ADO30CHXCD',26954.791015069663,2195,12.28,23798.692067102642,2800,8.5,10.35,'Same as description','Same as description'),
('Split_Wall_Mounted LG 2.25TR SEER 7.28','Split_Wall_Mounted','LG','S322GC SD3',26988.911003696332,3210,8.41,23747.512084162638,3690,6.44,7.28,'Same as description','Same as description'),
('Split_Wall_Mounted Gree 2.25TR SEER 11.11','Split_Wall_Mounted','Gree','GWC30QF-S3DTB2A/O',27000,2080,12.98,23200,2430,9.5500000000000007,11.11,'Same as description','Same as description'),
('Split_Wall_Mounted Okia 2.25TR SEER 10.59','Split_Wall_Mounted','Okia','OKA-30CH',27000,2160,12.5,23200,2620,8.85,10.59,'Same as description','Same as description'),
('Split_Wall_Mounted LG 2.25TR SEER 10.49','Split_Wall_Mounted','LG','ATNQ30GPLT4',27000,2180,12.39,24000,2760,8.6999999999999993,10.49,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 2.25TR SEER 10.20','Split_Wall_Mounted','Carrier','42QTD024VS',27000,2250,12,24000,2810,8.5399999999999991,10.199999999999999,'Same as description','Same as description'),
('Split_Wall_Mounted Fuji 2.2TR SEER 8.66','Split_Wall_Mounted','Fuji','RSA30FRTA-S',27500,2700,10.19,24000,3290,7.29,8.66,'Same as description','Same as description'),
('Split_Ceiling_Cassette LG 2.31TR SEER 7.39','Split_Ceiling_Cassette','LG','LTNC302PLEO',27800,3240,8.58,24400,3800,6.42,7.39,'Same as description','Same as description'),
('Split_Ceiling_Cassette LG 2.32TR SEER 8.12','Split_Ceiling_Cassette','LG','LTNC302NLE1',27807.790730736426,2920,9.52,24429.911856696046,3550,6.88,8.1199999999999992,'Same as description','Same as description'),
('Split_Wall_Mounted LG 2.33TR SEER 10.46','Split_Wall_Mounted','LG','T3224H / AS-W322V4B0',27978.390673869773,2320,12.06,24600.511799829401,2650,9.2799999999999994,10.46,'Same as description','Same as description'),
('Split_Wall_Mounted LG 2.33TR SEER 10.54','Split_Wall_Mounted','LG','T3224C / AS-Q322V4B0',27978.390673869777,2240,12.49,22382.712539095821,2510,8.92,10.54,'Same as description','Same as description'),
('Split_Wall_Mounted Samsung 2.33TR SEER 9.83','Split_Wall_Mounted','Samsung','AR30JVFUCWKX',28000,2430,11.52,25000,3010,8.31,9.83,'Same as description','Same as description'),
('Split_Wall_Mounted Zamil 2.35TR SEER 9.85','Split_Wall_Mounted','Zamil','ADO30CHXCW',28295.706568097812,2450,11.55,25296.559567813478,3048,8.3000000000000007,9.85,'Same as description','Same as description'),
('Split_Wall_Mounted LG 2.5TR SEER 10.43','Split_Wall_Mounted','LG','NT382H / S4-W32R43FA',30000,2440,12.3,25400,2885,8.8000000000000007,10.43,'Same as description','Same as description'),
('Split_Wall_Mounted Royal Temp 2.5TR SEER 7.53','Split_Wall_Mounted','Royal Temp ','MIS-300-HP',30000,3448,8.6999999999999993,24396,3587,6.8,7.53,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 2.58TR SEER 10.41','Split_Wall_Mounted','Carrier','42QHB030HS',31000,2520,12.3,26500,3050,8.69,10.41,'Same as description','Same as description'),
('Split_Wall_Mounted LG 2.58TR SEER 9.72','Split_Wall_Mounted','LG','T3624C / AS-Q362V4V0',31015.069661643443,2710,11.44,24805.231731589425,2960,8.3800000000000008,9.7200000000000006,'Same as description','Same as description'),
('Split_Wall_Mounted LG 2.58TR SEER 9.73','Split_Wall_Mounted','LG','T3624H / AS-W362V4V0',31015.069661643443,2720,11.4,24771.111742962756,2920,8.48,9.73,'Same as description','Same as description'),
('Split_Wall_Mounted LG 2.6TR SEER 7.18','Split_Wall_Mounted','LG','S382GH / LS-H382DSB0',31219.789593403468,3800,8.2200000000000006,27466.590844469723,4220,6.51,7.18,'Same as description','Same as description'),
('Split_Wall_Mounted LG 2.62TR SEER 8.13','Split_Wall_Mounted','LG','S3624H NV2',31390.389536536819,3300,9.51,28319.590560136479,4130,6.86,8.1300000000000008,'Same as description','Same as description'),
('Split_Wall_Mounted Zamil 2.62TR SEER 10.00','Split_Wall_Mounted','Zamil','ADO36CHXCW',31499.573500142167,2669,11.8,27998.862667045778,3373,8.3000000000000007,10,'Same as description','Same as description'),
('Split_Wall_Mounted Royal Temp 2.67TR SEER 7.44','Split_Wall_Mounted','Royal Temp ','MIS-320-HP',32000,3720,8.6,26380,3937,6.7,7.44,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 2.75TR SEER 8.54','Split_Wall_Mounted','Carrier','38XP100H3PE/ 42XP100H3PE',33000,3309.9297893681041,9.9700000000000006,29500,4057.7716643741405,7.27,8.5399999999999991,'Same as description','Same as description'),
('Split_Wall_Mounted Carrier 2.75TR SEER 8.81','Split_Wall_Mounted','Carrier','38XP100H3-E',33000,3200,10.31,29500,3950,7.47,8.81,'Same as description','Same as description'),
('Split_Ceiling_Cassette Carrier 2.88TR SEER 10.05','Split_Ceiling_Cassette','Carrier','42KTD036HS',34500,2950,11.69,31000,3600,8.61,10.050000000000001,'Same as description','Same as description'),
('Split_Floor_Standing LG 3.15TR SEER 7.86','Split_Floor_Standing','LG','LP-C552TM3',37873.187375604211,4100,9.24,32072.789309070235,4800,6.68,7.86,'Same as description','Same as description'),
('Split_Floor_Standing Daewoo 3.16TR SEER 8.11','Split_Floor_Standing','Daewoo','DPA-380RH / 300RH',38000,4000,9.5,31500,4500,7,8.11,'Same as description','Same as description'),
('Split_Floor_Standing LG 3.32TR SEER 7.22','Split_Floor_Standing','LG','LP-C552TE2',39920,4690,8.51,33096,5400,6.13,7.22,'Same as description','Same as description'),
('Split_Floor_Standing LG 3.33TR SEER 8.08','Split_Floor_Standing','LG','LPNC452TM5',39988.626670457779,4200,9.52,34017.628660790448,4970,6.84,8.08,'Same as description','Same as description'),
('Split_Ceiling_Ducted LG 3.37TR SEER 7.02','Split_Ceiling_Ducted','LG','LBNC422GSA4',40500.426499857829,5050,8.02,36508.387830537387,5750,6.35,7.02,'Same as description','Same as description'),
('Split_Floor_Standing Zamil 3.42TR SEER 6.87','Split_Floor_Standing','Zamil','DFX48ESCNASQ',40988.342337219226,5125,8,34491.896502701165,5725,6.02,6.87,'Same as description','Same as description'),
('Split_Floor_Standing Zamil 3.5TR SEER 8.37','Split_Floor_Standing','Zamil','GFX48MTHNIV',42000,4380,9.59,37530,5000,7.51,8.3699999999999992,'Same as description','Same as description'),
('Split_Floor_Standing Carrier 3.54TR SEER 8.52','Split_Floor_Standing','Carrier','42SD6B.38HK48',42500,4336.7346938775509,9.8000000000000007,37000,4836.6013071895422,7.65,8.52,'Same as description','Same as description'),
('Split_Floor_Standing Gree 3.62TR SEER 10.14','Split_Floor_Standing','Gree','GVH48AH-D3NTA5A/O',43500,3645,11.93,38200,4495,8.5,10.14,'Same as description','Same as description'),
('Split_Floor_Standing LG 3.72TR SEER 7.65','Split_Floor_Standing','LG','LP-H552TM2',44697.185100938303,4930,9.07,37531.987489337509,5860,6.4,7.65,'Same as description','Same as description'),
('Split_Floor_Standing LG 3.75TR SEER 7.47','Split_Floor_Standing','LG','LPNH552TM4',45038.384987205005,5150,8.75,38896.787034404326,6100,6.38,7.47,'Same as description','Same as description'),
('Split_Ceiling_Cassette LG 3.83TR SEER 9.87','Split_Ceiling_Cassette','LG','ATUW48GMLT0SA0',45993.74466875178,3960,11.61,39067.386977537673,4660,8.3800000000000008,9.8699999999999992,'Same as description','Same as description'),
('Split_Floor_Standing Zamil 3.83TR SEER 10.37','Split_Floor_Standing','Zamil','MFZ48CSHDAD',45997.15666761445,3740,12.3,40998.578333807229,4824,8.5,10.37,'Same as description','Same as description'),
('Split_Floor_Standing LG 3.84TR SEER 9.84','Split_Floor_Standing','LG','APNQ50GT1M0',46096.104634631789,4000,11.52,39988.626670457779,4750,8.42,9.84,'Same as description','Same as description'),
('Split_Floor_Standing LG 3.84TR SEER 9.84','Split_Floor_Standing','LG','APNQ50GT2E0',46096.104634631789,4000,11.52,39988.626670457779,4750,8.42,9.84,'Same as description','Same as description'),
('Split_Floor_Standing Samsung 4TR SEER 10.3','Split_Floor_Standing','Samsung','AF55JV1MAEEX/ AF55JV1MAEEN',48000,3930,12.21,42000,4950,8.48,10.3,'Same as description','Same as description'),
('Split_Floor_Standing LG 4TR SEER 10.51','Split_Floor_Standing','LG','APNQ55GT3M2',48000,3870,12.4,43000,4940,8.6999999999999993,10.51,'Same as description','Same as description'),
('Split_Floor_Standing LG 4TR SEER 10.51','Split_Floor_Standing','LG','APNQ55GT3M4',48000,3870,12.4,43000,4940,8.6999999999999993,10.51,'Same as description','Same as description'),
('Split_Floor_Standing Carrier 4TR SEER 9.95','Split_Floor_Standing','Carrier','42SDL6B',48000,4100,11.71,41500,4950,8.3800000000000008,9.9499999999999993,'Same as description','Same as description'),
('Split_Floor_Standing LG 4.01TR SEER 7.95','Split_Floor_Standing','LG','LPNC552TM4/TE3',48109,5200,9.25,42308,6150,6.88,7.95,'Same as description','Same as description'),
('Split_Floor_Standing LG 4.01TR SEER 8.67','Split_Floor_Standing','LG','LPNC552T1M5/E5',48109.183963605348,4750,10.130000000000001,42308.785897071371,5700,7.42,8.67,'Same as description','Same as description'),
('Split_Floor_Standing LG 4TR SEER 8.67','Split_Floor_Standing','LG','LPNH552T1M5',48109.183963605348,4750,10.130000000000001,42308.785897071371,5700,7.42,8.67,'Same as description','Same as description'),
('Split_Floor_Standing Samsung 4.16TR SEER 8.74','Split_Floor_Standing','Samsung','APH553QF',49967.441999999995,5200,9.61,49967.441999999995,5900,8.4700000000000006,8.74,'Same as description','Same as description'),
('Split_Ceiling_Cassette LG 4.21TR SEER 7.69','Split_Ceiling_Cassette','LG','LTUH602MLE0',50634.063121978965,5500,9.2100000000000009,41967.586010804669,6700,6.26,7.69,'Same as description','Same as description'),
('Split_Floor_Standing LG 4.35TR SEER 7.05','Split_Floor_Standing','LG','LP-H652ME0',52203.582598805806,6190,8.43,42991.185669604776,7440,5.78,7.05,'Same as description','Same as description'),
('Split_Ceiling_Ducted Zamil 4.41TR SEER 9.83','Split_Ceiling_Ducted','Zamil','KYA060H/DYA60H',53000,4600,11.52,47200,5690,8.3000000000000007,9.83,'Same as description','Same as description'),
('Split_Floor_Standing Zamil 4.421TR SEER 10.15','Split_Floor_Standing','Zamil','MFZ60CSCDADC',53056.582314472565,4416,12.01,45997.15666761445,5476,8.4,10.15,'Same as description','Same as description'),
('Split_Ceiling_Ducted Carrier 4.45TR SEER 8.30','Split_Ceiling_Ducted','Carrier','38MKS60US30-01',53500,5490,9.74,47000,6710,7,8.3000000000000007,'Same as description','Same as description'),
('Split_Floor_Standing LG 4.49TR SEER 8.28','Split_Floor_Standing','LG','LV-H602LLA3',53909.582030139332,5600,9.6300000000000008,47426.784191071943,6600,7.19,8.2799999999999994,'Same as description','Same as description'),
('Split_Floor_Standing LG 4.5TR SEER 10.00','Split_Floor_Standing','LG','ABUQ60LM3T0 / ABUQ54LM3T0',54000,4610,11.71,45600,5300,8.6,10,'Same as description','Same as description'),
('Split_Ceiling_Ducted LG 4.86TR SEER 7.90','Split_Ceiling_Ducted','LG','LBNC602RSA4',58345.180551606492,6350,9.19,51214.102928632354,7500,6.83,7.9,'Same as description','Same as description'),
('Split_Wall_Mounted Daikin 1.78TR SEER 7.47','Split_Wall_Mounted','Daikin','FTY24HEVLK',21350,2470,8.64,18330,2770,6.62,7.47,'Same as description','Same as description'),
('Split_Wall_Mounted Daikin 2.28TR SEER 8.57','Split_Wall_Mounted','Daikin','R30KEVLK / FT30KEVLK',27300,2750,9.93,24000,3200,7.5,8.57,'Same as description','Same as description'),
('Split_Ceiling_Ducted YORK 1.5TR SEER 6.41','Split_Ceiling_Ducted','YORK','YE3SD18OSHBW22-VH',18000,2390,7.53,15480,2850,5.43,6.41,'Same as description','Same as description'),
('Split_Ceiling_Ducted YORK 2TR SEER 6.41','Split_Ceiling_Ducted','YORK','YE3Cf24CS7AC22',24000,3190,7.52,20640,3800,5.43,6.41,'Same as description','Same as description'),
('Split_Ceiling_Ducted YORK 4TR SEER 6.90','Split_Ceiling_Ducted','YORK','YE3SD48SECAC22-H',48000,6380,7.52,41280,5570,7.41,6.9,'Same as description','Same as description'),
('Split_Ceiling_Ducted YORK 2.5TR SEER 6.40','Split_Ceiling_Ducted','YORK','YE3SD30RSHAC22-H',30000,3990,7.52,25800,4750,5.43,6.4,'Same as description','Same as description'),
('Split_Ceiling_Ducted YORK 3TR SEER 6.70','Split_Ceiling_Ducted','YORK','YE3SD36RSHAD22-2',36000,4790,7.52,30960,4750,6.52,6.7,'Same as description','Same as description'),
('Split_Ceiling_Ducted YORK 5TR SEER 6.39','Split_Ceiling_Ducted','YORK','YE3SD60SECBK22-H',60000,7980,7.52,51600,9540,5.41,6.39,'Same as description','Same as description'),
('Window LG 1.39TR SEER 7.03','Window','LG','W182EC SN2 /GWC182NAAB3',16719,2000,8.36,13477,2300,5.86,7.03,'Same as Description','Same as Description'),
('Window Carrier 1.43TR SEER 8.52','Window','Carrier','51HSR183MA0G',17200,1720,10,15000,2083,7.2,8.52,'Same as Description','Same as Description'),
('Window Carrier 1.5TR SEER 8.62','Window','Carrier','CRSR183M-0GSE',17800,1745,10.199999999999999,15000,2083,7.2,8.6199999999999992,'Same as Description','Same as Description'),
('Window LG 1.49TR SEER 7.24','Window','LG','Z182EC',17947,2110,8.51,15353,2500,6.14,7.24,'Same as Description','Same as Description'),
('Window Samsung 1.5TR SEER 6.82','Window','Samsung','AHT18P1HBA',18000,2200,8.18,14474,2600,5.57,6.82,'Same as Description','Same as Description'),
('Window LG 1.5TR SEER 7.70','Window','LG','W182EH SN3',18000,2020,8.91,14978.675007108332,2180,6.87,7.7,'Same as Description','Same as Description'),
('Window LG 1.5TR SEER 7.70','Window','LG','LWH182NFAZ3',18000,2020,8.91,14978.675007108332,2180,6.87,7.7,'Same as Description','Same as Description'),
('Window  Zamil 1.5TR SEER 6.80','Window','Zamil','YHB18CTEYIINW',18000,2200,8.18,14000,2520,5.56,6.8,'Same as Description','Same as Description'),
('Window Zamil 1.5TR SEER 6.51','Window','Zamil','PCB19CKXQIMNW',18260,2360,7.74,14260,2600,5.48,6.51,'Same as Description','Same as Description'),
('Window  Zamil 1.5TR SEER 6.80','Window','Zamil','ACB19CTXPIMNW',18500,2260,8.19,14000,2510,5.58,6.8,'Same as Description','Same as Description'),
('Window  Zamil 1.5TR SEER 6.92','Window','Zamil','AHB19CTEPIMNW',18500,2220,8.33,14500,2580,5.62,6.92,'Same as Description','Same as Description'),
('Window LG 1.74TR SEER 7.22','Window','LG','W242EH SN0',20983.793005402335,2500,8.39,18493.033835655391,2950,6.27,7.22,'Same as Description','Same as Description'),
('Window York  1.75TR SEER 8.45','Window','York ','NYSR243M-0G8',21000,2100,10,17500,2465,7.1,8.4499999999999993,'Same as Description','Same as Description'),
('Window Zamil 1.79TR SEER 6.38','Window','Zamil','ZHB24CPEQIMNW',21500,2870,7.49,18000,3300,5.45,6.38,'Same as Description','Same as Description'),
('Window Zamil 1.88TR SEER 7.28','Window','Zamil','NHB24CGERIMNW',22500,2630,8.56,19500,3170,6.15,7.28,'Same as Description','Same as Description'),
('Window LG 2TR SEER 7.48','Window','LG','W242EH',24000,2560,9.3800000000000008,16206,2880,5.63,7.48,'Same as Description','Same as Description'),
('Window Zamil 2TR SEER 6.34','Window','Zamil','PHB24CIEQIINW',24000,3200,7.5,19000,3520,5.4,6.34,'Same as Description','Same as Description'),
('Window Royal Temp 2TR SEER 6.41','Window','Royal Temp ','WGS-24PE',24000,3190,7.52,20640,3800,5.43,6.41,'Same as Description','Same as Description'),
('Window  Zamil 2TR SEER 6.23','Window','Zamil','AHB26CHHLKKNW',24000,3330,7.21,18800,3300,5.7,6.23,'Same as Description','Same as Description'),
('Window  Zamil 2TR SEER 6.41','Window','Zamil','ACB24CIXPIMNW',24000,3100,7.74,18000,3450,5.22,6.41,'Same as Description','Same as Description'),
('Window  Zamil 2TR SEER 6.95','Window','Zamil','LCB24CTXCIING',24000,2800,8.57,18000,3350,5.37,6.95,'Same as Description','Same as Description'),
('Window  Zamil 2TR SEER 7.22','Window','Zamil','AHB24CMESAANW',24000,2750,8.73,18000,3060,5.88,7.22,'Same as Description','Same as Description'),
('Window  Zamil 2TR SEER 7.33','Window','Zamil','AHB26CRELIINW',24000,2710,8.86,17900,3001,5.96,7.33,'Same as Description','Same as Description'),
('Window Zamil 2TR SEER 7.10','Window','Zamil','AHB24CREPLNW',24000,2800,8.57,18000,3100,5.81,7.1,'Same as Description','Same as Description'),
('Window Zamil 2TR SEER 7.20','Window','Zamil','AHB25CEBW',24000,2750,8.73,18000,3100,5.81,7.2,'Same as Description','Same as Description'),
('Window Zamil 2TR SEER 6.95','Window','Zamil','UHB25CTESIJNW',24000,2800,8.57,18000,3350,5.37,6.95,'Same as Description','Same as Description'),
('Window Zamil 2TR SEER 7.24','Window','Zamil','CHB24CEDW',24000,2750,8.73,18000,3020,5.96,7.24,'Same as Description','Same as Description'),
('Window York  2TR SEER 7.22','Window','York ','LYSD243M-0B5 / NYSD243M-0B5',24050,2813,8.5500000000000007,18970,3089,6.14,7.22,'Same as Description','Same as Description'),
('Window Zamil 2TR SEER 7.22','Window','Zamil','HHB24CHERKINW',24050,2813,8.5500000000000007,19000,3104,6.12,7.22,'Same as Description','Same as Description'),
('Window  Zamil Classic 2TR SEER 7.22','Window','Zamil','AHB26CHERKINW',24050,2813,8.5500000000000007,19000,3104,6.12,7.22,'Same as Description','Same as Description'),
('Window Zamil 2.01TR SEER 7.86','Window','Zamil','LCB24CKXGKINW',24196,2574,9.4,19000,2920,6.51,7.86,'Same as Description','Same as Description'),
('Window York  2.01TR SEER 7.57','Window','York ','LYSD243M-0C8 / NYSD243M-0C8',24200,2674,9.0500000000000007,18700,2968,6.3,7.57,'Same as Description','Same as Description'),
('Window Carrier 2.01TR SEER 7.57','Window','Carrier','CRSD243M-0C8',24200,2674,9.0500000000000007,18700,2968,6.3,7.57,'Same as Description','Same as Description'),
('Window Carrier 2.01TR SEER 7.59','Window','Carrier','C2K24MB-RG9',24200,2674,9.0500000000000007,19500,3095,6.3,7.59,'Same as Description','Same as Description'),
('Window HAAS 2.01TR SEER 7.93','Window','HAAS','HE24E6YH3XHS00',24200,2574,9.4,21000,3206,6.55,7.93,'Same as Description','Same as Description'),
('Window Zamil 2.01TR SEER 7.86','Window','Zamil','HHB24CKEGKINW',24200,2574,9.4,19000,2920,6.51,7.86,'Same as Description','Same as Description'),
('Window Zamil 2.01TR SEER 7.89','Window','Zamil','ZHD24CAEGKNNW',24200,2574,9.4,20000,3075,6.5,7.89,'Same as Description','Same as Description'),
('Window Carrier 2.02TR SEER 7.57','Window','Carrier','51HSD243MA0C',24200,2674,9.0500000000000007,18700,2968,6.3,7.57,'Same as Description','Same as Description')
on conflict (equipment_type, model_no) do update set
  description = excluded.description,
  make = excluded.make,
  t1_btu = excluded.t1_btu,
  t1_w = excluded.t1_w,
  t1_eer = excluded.t1_eer,
  t3_btu = excluded.t3_btu,
  t3_w = excluded.t3_w,
  t3_eer = excluded.t3_eer,
  equivalent_seer = excluded.equivalent_seer,
  nameplate_ref = excluded.nameplate_ref,
  datasheet_ref = excluded.datasheet_ref
where (t.description, t.make, t.t1_btu, t.t1_w, t.t1_eer, t.t3_btu, t.t3_w, t.t3_eer, t.equivalent_seer, t.nameplate_ref, t.datasheet_ref)
   is distinct from (excluded.description, excluded.make, excluded.t1_btu, excluded.t1_w, excluded.t1_eer, excluded.t3_btu, excluded.t3_w, excluded.t3_eer, excluded.equivalent_seer, excluded.nameplate_ref, excluded.datasheet_ref);

-- --------------------------------------------------------------------------
-- lighting_baseline_registry — 339 rows from Lighting template / Old_Model_Registry
-- --------------------------------------------------------------------------
-- >>> CHUNK 10/11 — lighting_baseline_registry rows 1-200 of 339
insert into public.lighting_baseline_registry as t (sr_no, surveyed_unit_description, lamp_type, conv_led, location_type, shape_size_base, length_width_diameter, lamps_per_fixture, wattage_w, lumens_lm) values
(1,'Conv-FTL-T8-1.5M-1X-56W','FTL','Conv','Interior','T8','1.5M-',1,56,2800),
(2,'Conv-FTL-T8-1.5M-2X-56W','FTL','Conv','Interior','T8','1.5M-',2,56,5600),
(3,'Conv-FTL-T8-1.5M-3X-56W','FTL','Conv','Interior','T8','1.5M-',3,56,8400),
(4,'Conv-FTL-T8-1.5M-4X-56W','FTL','Conv','Interior','T8','1.5M-',4,56,11200),
(5,'Conv-FTL-T12-1.2M-1X-40W','FTL','Conv','Interior','T12','1.2M-',1,40,2000),
(6,'Conv-FTL-T12-1.2M-2X-40W','FTL','Conv','Interior','T12','1.2M-',2,40,4000),
(7,'Conv-FTL-T12-1.2M-3X-40W','FTL','Conv','Interior','T12','1.2M-',3,40,6000),
(8,'Conv-FTL-T12-1.2M-4X-40W','FTL','Conv','Interior','T12','1.2M-',4,40,8000),
(9,'Conv-FTL-T8-1.2M-1X-36W','FTL','Conv','Interior','T8','1.2M-',1,36,1800),
(10,'Conv-FTL-T8-1.2M-2X-36W','FTL','Conv','Interior','T8','1.2M-',2,36,3600),
(11,'Conv-FTL-T8-1.2M-3X-36W','FTL','Conv','Interior','T8','1.2M-',3,36,5400),
(12,'Conv-FTL-T8-1.2M-4X-36W','FTL','Conv','Interior','T8','1.2M-',4,36,7200),
(13,'Conv-FTL-T12-0.6M-1X-20W','FTL','Conv','Interior','T12','0.6M-',1,20,1000),
(14,'Conv-FTL-T12-0.6M-2X-20W','FTL','Conv','Interior','T12','0.6M-',2,20,2000),
(15,'Conv-FTL-T12-0.6M-3X-20W','FTL','Conv','Interior','T12','0.6M-',3,20,3000),
(16,'Conv-FTL-T12-0.6M-4X-20W','FTL','Conv','Interior','T12','0.6M-',4,20,4000),
(17,'Conv-FTL-T8-0.6M-1X-18W','FTL','Conv','Interior','T8','0.6M-',1,18,900),
(18,'Conv-FTL-T8-0.6M-2X-18W','FTL','Conv','Interior','T8','0.6M-',2,18,1800),
(19,'Conv-FTL-T8-0.6M-3X-18W','FTL','Conv','Interior','T8','0.6M-',3,18,2700),
(20,'Conv-FTL-T8-0.6M-4X-18W','FTL','Conv','Interior','T8','0.6M-',4,18,3600),
(21,'Conv-FTL-T5-1.5M-1X-35W','FTL','Conv','Interior','T5','1.5M-',1,35,1750),
(22,'Conv-FTL-T5-1.5M-2X-35W','FTL','Conv','Interior','T5','1.5M-',2,35,3500),
(23,'Conv-FTL-T5-1.5M-3X-35W','FTL','Conv','Interior','T5','1.5M-',3,35,5250),
(24,'Conv-FTL-T5-1.5M-4X-35W','FTL','Conv','Interior','T5','1.5M-',4,35,7000),
(25,'Conv-FTL-T5-1.2M-1X-28W','FTL','Conv','Interior','T5','1.2M-',1,28,1400),
(26,'Conv-FTL-T5-1.2M-2X-28W','FTL','Conv','Interior','T5','1.2M-',2,28,2800),
(27,'Conv-FTL-T5-1.2M-3X-28W','FTL','Conv','Interior','T5','1.2M-',3,28,4200),
(28,'Conv-FTL-T5-1.2M-4X-28W','FTL','Conv','Interior','T5','1.2M-',4,28,5600),
(29,'Conv-FTL-T5-0.6M-1X-14W','FTL','Conv','Interior','T5','0.6M-',1,14,700),
(30,'Conv-FTL-T5-0.6M-2X-14W','FTL','Conv','Interior','T5','0.6M-',2,14,1400),
(31,'Conv-FTL-T5-0.6M-3X-14W','FTL','Conv','Interior','T5','0.6M-',3,14,2100),
(32,'Conv-FTL-T5-0.6M-4X-14W','FTL','Conv','Interior','T5','0.6M-',4,14,2800),
(33,'Conv-CFL-E27-1X-9W','CFL','Conv','Interior','E27',null,1,9,450),
(34,'Conv-CFL-E27-1X-10W','CFL','Conv','Interior','E27',null,1,10,500),
(35,'Conv-CFL-E27-1X-12W','CFL','Conv','Interior','E27',null,1,12,600),
(36,'Conv-CFL-E27-1X-13W','CFL','Conv','Interior','E27',null,1,13,650),
(37,'Conv-CFL-E27-1X-15W','CFL','Conv','Interior','E27',null,1,15,750),
(38,'Conv-CFL-E27-1X-16W','CFL','Conv','Interior','E27',null,1,16,800),
(39,'Conv-CFL-E27-1X-18W','CFL','Conv','Interior','E27',null,1,18,900),
(40,'Conv-CFL-E27-1X-20W','CFL','Conv','Interior','E27',null,1,20,1000),
(41,'Conv-CFL-E27-1X-23W','CFL','Conv','Interior','E27',null,1,23,1150),
(42,'Conv-CFL-E27-1X-26W','CFL','Conv','Interior','E27',null,1,26,1300),
(43,'Conv-CFL-E27-1X-30W','CFL','Conv','Interior','E27',null,1,30,1500),
(44,'Conv-CFL-E27-1X-40W','CFL','Conv','Interior','E27',null,1,40,2000),
(45,'Conv-CFL-E40-1X-42W','CFL','Conv','Interior','E40',null,1,42,2100),
(46,'Conv-CFL-E40-1X-60W','CFL','Conv','Interior','E40',null,1,60,3000),
(47,'Conv-CFL-E40-1X-65W','CFL','Conv','Interior','E40',null,1,65,3250),
(48,'Conv-CFL-E40-1X-80W','CFL','Conv','Interior','E40',null,1,80,4000),
(49,'Conv-CFL-2Pin-2X-23W','CFL','Conv','Interior','2Pin',null,2,23,2300),
(50,'Conv-CFL-2Pin-2X-26W','CFL','Conv','Interior','2Pin',null,2,26,2600),
(51,'Conv-Candle-E14-1X-20W','Candle','Conv','Interior','E14',null,1,20,200),
(52,'Conv-Candle-E14-1X-40W','Candle','Conv','Interior','E14',null,1,40,400),
(53,'Conv-MH-E40-1X-70W','MH','Conv','Exterior','E40',null,1,70,3500),
(54,'Conv-MH-E40-1X-100W','MH','Conv','Exterior','E40',null,1,100,5000),
(55,'Conv-MH-E40-1X-150W','MH','Conv','Exterior','E40',null,1,150,7500),
(56,'Conv-MH-E40-1X-400W','MH','Conv','Exterior','E40',null,1,400,20000),
(57,'Conv-MH-Flood Light-1X-70W','MH','Conv','Exterior','Flood Light',null,1,70,3500),
(58,'Conv-MH-Flood Light-1X-100W','MH','Conv','Exterior','Flood Light',null,1,100,5000),
(59,'Conv-MH-Flood Light-1X-400W','MH','Conv','Exterior','Flood Light',null,1,400,20000),
(60,'Conv-MH-Downlight-1X-70W','MH','Conv','Interior','Downlight',null,1,70,3500),
(61,'Conv-MH-Down Light-1X-150W','MH','Conv','Interior','Down Light',null,1,150,7500),
(62,'Conv-MV-E40-1X-70W','MV','Conv','Exterior','E40',null,1,70,2450),
(63,'Conv-MV-E40-1X-80W','MV','Conv','Exterior','E40',null,1,80,2800),
(64,'Conv-MV-E40-1X-175W','MV','Conv','Exterior','E40',null,1,175,6125),
(65,'Conv-MV-Flood Light-1X-80W','MV','Conv','Exterior','Flood Light',null,1,80,2800),
(66,'Conv-MV-Flood Light-1X-250W','MV','Conv','Exterior','Flood Light',null,1,250,8750),
(67,'Conv-MV-Flood Light-1X-400W','MV','Conv','Exterior','Flood Light',null,1,400,14000),
(69,'Conv-Incandescent-E27-1X-40W','Incandescent','Conv','Interior','E27',null,1,40,400),
(70,'Conv-Incandescent-E27-1X-60W','Incandescent','Conv','Interior','E27',null,1,60,600),
(71,'Conv-Incandescent-E27-1X-100W','Incandescent','Conv','Interior','E27',null,1,100,1000),
(72,'Conv-Halogen-Spot Light-1X-25W','Halogen','Conv','Interior','Spot Light',null,1,25,250),
(73,'Conv-Halogen-Spot Light-1X-40W','Halogen','Conv','Interior','Spot Light',null,1,40,400),
(74,'Conv-Halogen-Spot Light-1X-50W','Halogen','Conv','Interior','Spot Light',null,1,50,500),
(75,'Conv-Halogen-Flood Light-1X-100W','Halogen','Conv','Exterior','Flood Light',null,1,100,1000),
(76,'Conv-Halogen-Flood Light-1X-150W','Halogen','Conv','Exterior','Flood Light',null,1,150,1500),
(77,'Conv-Halogen-Flood Light-1X-200W','Halogen','Conv','Exterior','Flood Light',null,1,200,2000),
(78,'Conv-Halogen-Flood Light-1X-250W','Halogen','Conv','Exterior','Flood Light',null,1,250,2500),
(79,'Conv-Halogen-Flood Light-1X-300W','Halogen','Conv','Exterior','Flood Light',null,1,300,3000),
(80,'Conv-Halogen-Flood Light-1X-400W','Halogen','Conv','Exterior','Flood Light',null,1,400,4000),
(81,'Conv-Halogen-Flood Light-1X-500W','Halogen','Conv','Exterior','Flood Light',null,1,500,5000),
(82,'Conv-Halogen-Flood Light-1X-600W','Halogen','Conv','Exterior','Flood Light',null,1,600,6000),
(83,'Conv-Halogen-Flood Light-1X-1500W','Halogen','Conv','Exterior','Flood Light',null,1,1500,15000),
(84,'Conv-Halogen-Flood Light-1X-2000W','Halogen','Conv','Exterior','Flood Light',null,1,2000,20000),
(85,'Conv-HPS-Flood Light-1X-100W','HPS','Conv','Exterior','Flood Light',null,1,100,5000),
(86,'Conv-HPS-Flood Light-1X-150W','HPS','Conv','Exterior','Flood Light',null,1,150,7500),
(87,'Conv-HPS-Flood Light-1X-250W','HPS','Conv','Exterior','Flood Light',null,1,250,12500),
(88,'Conv-HPS-Flood Light-1X-400W','HPS','Conv','Exterior','Flood Light',null,1,400,20000),
(89,'Conv-HPS-Flood Light-1X-1000W','HPS','Conv','Exterior','Flood Light',null,1,1000,50000),
(90,'Conv-HPS-Street Light-1X-250W','HPS','Conv','Exterior','Street Light',null,1,250,12500),
(91,'Conv-HPS-Street Light-1X-400W','HPS','Conv','Exterior','Street Light',null,1,400,20000),
(92,'Conv-HPS-High Bay-1X-250W','HPS','Conv','Interior','High Bay',null,1,250,12500),
(93,'Conv-HPS-High Bay-1X-400W','HPS','Conv','Interior','High Bay',null,1,400,20000),
(94,'Conv-HPS-E40-1X-100W','HPS','Conv','Interior','E40',null,1,100,5000),
(95,'LED_Tube-T8-1.5M-1X-30W','LED_Tube','LED','Interior','T8','1.5M-',1,30,2250),
(96,'LED_Tube-T8-1.5M-2X-30W','LED_Tube','LED','Interior','T8','1.5M-',2,30,4500),
(97,'LED_Tube-T8-1.5M-3X-30W','LED_Tube','LED','Interior','T8','1.5M-',3,30,6750),
(98,'LED_Tube-T8-1.5M-4X-30W','LED_Tube','LED','Interior','T8','1.5M-',4,30,9000),
(99,'LED_Tube-T8-1.2M-1X-20W','LED_Tube','LED','Interior','T8','1.2M-',1,20,1500),
(100,'LED_Tube-T8-1.2M-2X-20W','LED_Tube','LED','Interior','T8','1.2M-',2,20,3000),
(101,'LED_Tube-T8-1.2M-3X-20W','LED_Tube','LED','Interior','T8','1.2M-',3,20,4500),
(102,'LED_Tube-T8-1.2M-4X-20W','LED_Tube','LED','Interior','T8','1.2M-',4,20,6000),
(103,'LED_Tube-T8-1.2M-1X-18W','LED_Tube','LED','Interior','T8','1.2M-',1,18,1350),
(104,'LED_Tube-T8-1.2M-2X-18W','LED_Tube','LED','Interior','T8','1.2M-',2,18,2700),
(105,'LED_Tube-T8-1.2M-3X-18W','LED_Tube','LED','Interior','T8','1.2M-',3,18,4050),
(106,'LED_Tube-T8-1.2M-4X-18W','LED_Tube','LED','Interior','T8','1.2M-',4,18,5400),
(107,'LED_Tube-T8-0.6M-1X-20W','LED_Tube','LED','Interior','T8','0.6M-',1,20,1500),
(108,'LED_Tube-T8-0.6M-2X-20W','LED_Tube','LED','Interior','T8','0.6M-',2,20,3000),
(109,'LED_Tube-T8-0.6M-3X-20W','LED_Tube','LED','Interior','T8','0.6M-',3,20,4500),
(110,'LED_Tube-T8-0.6M-4X-20W','LED_Tube','LED','Interior','T8','0.6M-',4,20,6000),
(111,'LED_Tube-T8-0.6M-1X-18W','LED_Tube','LED','Interior','T8','0.6M-',1,18,1350),
(112,'LED_Tube-T8-0.6M-2X-18W','LED_Tube','LED','Interior','T8','0.6M-',2,18,2700),
(113,'LED_Tube-T8-0.6M-3X-18W','LED_Tube','LED','Interior','T8','0.6M-',3,18,4050),
(114,'LED_Tube-T8-0.6M-4X-18W','LED_Tube','LED','Interior','T8','0.6M-',4,18,5400),
(115,'LED_Spot_Light-Spot Light-1X-5W','LED_Spot_Light','LED','Interior','Spot Light',null,1,5,350),
(116,'LED_Spot_Light-Spot Light-1X-7W','LED_Spot_Light','LED','Interior','Spot Light',null,1,7,490),
(117,'LED_Bulb-E27-1X-9W','LED_Bulb','LED','Interior','E27',null,1,9,675),
(118,'LED_Bulb-E27-1X-12W','LED_Bulb','LED','Interior','E27',null,1,12,900),
(119,'LED_Bulb-E27-1X-15W','LED_Bulb','LED','Interior','E27',null,1,15,1125),
(120,'LED_Bulb-E27-1X-20W','LED_Bulb','LED','Interior','E27',null,1,20,1500),
(121,'LED_Bulb-E40-1X-50W','LED_Bulb','LED','Interior','E40',null,1,50,3750),
(122,'LED_Panel_light-60X60-1X-48W','LED_Panel_light','LED','Interior','60X60',null,1,48,3600),
(123,'LED_Panel_light-60X60-1X-40W','LED_Panel_light','LED','Interior','60X60',null,1,40,3000),
(124,'LED_Panel_light-60X60-1X-60W','LED_Panel_light','LED','Interior','60X60',null,1,60,4500),
(125,'LED_Panel_light-60X60-1X-80W','LED_Panel_light','LED','Interior','60X60',null,1,80,6000),
(126,'LED_Panel_light-60X60-1X-100W','LED_Panel_light','LED','Interior','60X60',null,1,100,7500),
(127,'LED_Downlight-4''''-1X-9W','LED_Downlight','LED','Interior','4''''',null,1,9,675),
(128,'LED_Downlight-4''''-1X-10W','LED_Downlight','LED','Interior','4''''',null,1,10,750),
(129,'LED_Downlight-4''''-1X-15W','LED_Downlight','LED','Interior','4''''',null,1,15,1125),
(130,'LED_Downlight-6''''-1X-20W','LED_Downlight','LED','Interior','6''''',null,1,20,1500),
(131,'LED_Downlight-8''''-1X-30W','LED_Downlight','LED','Interior','8''''',null,1,30,2250),
(132,'LED_Downlight-8''''-1X-40W','LED_Downlight','LED','Interior','8''''',null,1,40,3000),
(133,'LED_Flood_Light-Flood Light-1X-50W','LED_Flood_Light','LED','Exterior','Flood Light',null,1,50,4000),
(134,'LED_Flood_Light-Flood Light-1X-100W','LED_Flood_Light','LED','Exterior','Flood Light',null,1,100,8000),
(135,'LED_Flood_Light-Flood Light-1X-150W','LED_Flood_Light','LED','Exterior','Flood Light',null,1,150,12000),
(136,'LED_Flood_Light-Flood Light-1X-200W','LED_Flood_Light','LED','Exterior','Flood Light',null,1,200,16000),
(137,'LED_Flood_Light-Flood Light-1X-250W','LED_Flood_Light','LED','Exterior','Flood Light',null,1,250,20000),
(138,'LED_Flood_Light-Flood Light-1X-300W','LED_Flood_Light','LED','Exterior','Flood Light',null,1,300,24000),
(139,'LED_Flood_Light-Flood Light-1X-400W','LED_Flood_Light','LED','Exterior','Flood Light',null,1,400,32000),
(140,'LED_High_Bay-High Bay-1X-200W','LED_High_Bay','LED','Interior','High Bay',null,1,200,16000),
(141,'LED_High_Bay-High Bay-1X-250W','LED_High_Bay','LED','Interior','High Bay',null,1,250,20000),
(142,'LED_High_Bay-High Bay-1X-400W','LED_High_Bay','LED','Interior','High Bay',null,1,400,32000),
(143,'LED_Street_Light-Street Light-1X-150W','LED_Street_Light','LED','Exterior','Street Light',null,1,150,12000),
(144,'LED_Street_Light-Street Light-1X-200W','LED_Street_Light','LED','Exterior','Street Light',null,1,200,16000),
(145,'LED_Street_Light-Street Light-1X-250W','LED_Street_Light','LED','Exterior','Street Light',null,1,250,20000),
(146,'LED_Street_Light-Street Light-1X-300W','LED_Street_Light','LED','Exterior','Street Light',null,1,300,24000),
(147,'LED_Stick-E27-1X-9W','LED_Stick','LED','Interior','E27',null,1,9,675),
(148,'LED_Stick-E27-1X-12W','LED_Stick','LED','Interior','E27',null,1,12,900),
(149,'LED_Stick-E27-1X-15W','LED_Stick','LED','Interior','E27',null,1,15,1125),
(150,'LED_Candle_Light-E14-1X-9W','LED_Candle_Light','LED','Interior','E14',null,1,9,630),
(151,'Conv-CFL-2Pin-1X-13W','CFL','Conv','Interior','2Pin',null,1,13,650),
(152,'Conv-CFL-2Pin-1X-18W','CFL','Conv','Interior','2Pin',null,1,18,900),
(153,'Conv-CFL-2Pin-1X-24W','CFL','Conv','Interior','2Pin',null,1,24,1200),
(154,'Conv-CFL-2Pin-1X-26W','CFL','Conv','Interior','2Pin',null,1,26,1300),
(155,'Conv-CFL-4Pin-1X-18W','CFL','Conv','Interior','4Pin',null,1,18,900),
(156,'Conv-CFL-4Pin-1X-26W','CFL','Conv','Interior','4Pin',null,1,26,1300),
(157,'Conv-CFL-4Pin-1X-110W','CFL','Conv','Interior','4Pin',null,1,110,5500),
(158,'Conv-CFL-4Pin-1X-13W','CFL','Conv','Interior','4Pin',null,1,13,650),
(159,'Conv-CFL-4Pin-1X-24W','CFL','Conv','Interior','4Pin',null,1,24,1200),
(160,'Conv-CFL-4Pin-1X-27W','CFL','Conv','Interior','4Pin',null,1,27,1350),
(161,'Conv-CFL-4Pin-1X-28W','CFL','Conv','Interior','4Pin',null,1,28,1400),
(162,'Conv-CFL-4Pin-1X-35W','CFL','Conv','Interior','4Pin',null,1,35,1750),
(163,'Conv-CFL-4Pin-1X-55W','CFL','Conv','Interior','4Pin',null,1,55,2750),
(164,'Conv-Candle-E14-1X-30W','Candle','Conv','Interior','E14',null,1,30,300),
(165,'Conv-Candle-E14-1X-5W','Candle','Conv','Interior','E14',null,1,5,50),
(166,'LED_Downlight-8''''-1X-35W','LED_Downlight','LED','Interior','8''''',null,1,35,2625),
(167,'LED_Downlight-8''''-1X-27W','LED_Downlight','LED','Interior','8''''',null,1,27,2025),
(168,'Conv-Halogen-Flood Light-1X-70W','Halogen','Conv','Exterior','Flood Light',null,1,70,700),
(169,'Conv-HPS-Street Light-1X-70W','HPS','Conv','Exterior','Street Light',null,1,70,3500),
(170,'Conv-HPS-Street Light-1X-125W','HPS','Conv','Exterior','Street Light',null,1,125,6250),
(171,'Conv-HPS-Street Light-1X-150W','HPS','Conv','Exterior','Street Light',null,1,150,7500),
(172,'LED_High_Bay-High Bay-1X-30W','LED_High_Bay','LED','Exterior','High Bay',null,1,30,2400),
(173,'LED_High_Bay-High Bay-1X-150W','LED_High_Bay','LED','Exterior','High Bay',null,1,150,12000),
(174,'LED_Panel_light-60X60-1X-72W','LED_Panel_light','LED','Interior','60X60',null,1,72,5400),
(175,'LED_Panel_light-60X60-1X-96W','LED_Panel_light','LED','Interior','60X60',null,1,96,7200),
(176,'LED_Panel_light-60X60-1X-36W','LED_Panel_light','LED','Interior','60X60',null,1,36,2700),
(177,'LED_Panel_light-60X60-1X-45W','LED_Panel_light','LED','Interior','60X60',null,1,45,3375),
(178,'Conv-MV-E40-1X-110W','MV','Conv','Interior','E40',null,1,110,3850),
(179,'Conv-MV-E40-1X-125W','MV','Conv','Interior','E40',null,1,125,4375),
(180,'Conv-MV-E40-1X-35W','MV','Conv','Interior','E40',null,1,35,1225),
(181,'Conv-MV-E40-1X-40W','MV','Conv','Interior','E40',null,1,40,1400),
(182,'Conv-MV-E40-1X-50W','MV','Conv','Interior','E40',null,1,50,1750),
(183,'Conv-MH-E40-1X-35W','MH','Conv','Interior','E40',null,1,35,1750),
(184,'Conv-HPS-Street Light-1X-600W','HPS','Conv','Exterior','Street Light',null,1,600,30000),
(185,'Conv-CFL-E27-1X-11W','CFL','Conv','Interior','E27',null,1,11,550),
(186,'LED_Bulb-E27-1X-25W','LED_Bulb','LED','Interior','E27',null,1,25,1875),
(187,'LED_Bulb-E27-1X-35W','LED_Bulb','LED','Interior','E27',null,1,35,2625),
(188,'LED_Bulb-E28-1X-13W','LED_Bulb','LED','Interior','E28',null,1,13,975),
(189,'LED_Bulb-E29-1X-7W','LED_Bulb','LED','Interior','E29',null,1,7,525),
(190,'LED_Spot_Light-Spot Light-1X-8W','LED_Spot_Light','LED','Interior','Spot Light',null,1,8,560),
(191,'LED_Spot_Light-Spot Light-1X-9W','LED_Spot_Light','LED','Interior','Spot Light',null,1,9,630),
(192,'LED_Downlight-4"-1X-12W','LED_Downlight','LED','Interior','4"',null,1,12,900),
(193,'LED_Downlight-4"-1X-13W','LED_Downlight','LED','Interior','4"',null,1,13,975),
(194,'LED_Downlight-6"-1X-16W','LED_Downlight','LED','Interior','6"',null,1,16,1200),
(195,'LED_Downlight-6"-1X-22W','LED_Downlight','LED','Interior','6"',null,1,22,1650),
(196,'LED_Downlight-8"-1X-24W','LED_Downlight','LED','Interior','8"',null,1,24,1800),
(197,'LED_Downlight-8"-1X-60W','LED_Downlight','LED','Interior','8"',null,1,60,4500),
(198,'LED_High_Bay-High Bay-1X-190W','LED_High_Bay','LED','Interior','High Bay',null,1,190,15200),
(199,'Conv-LED_Tube-T8-1.2M-3X-36W','LED_Tube','Conv','Interior','T8','1.2M-',3,36,8100),
(200,'Conv-CFL-E27-1X-70W','CFL','Conv','Exterior','E27',null,1,70,3500),
(201,'LED_Tube-T8-0.6M-4X-10W','LED_Tube','LED','Interior','T8','0.6M-',4,10,3000)
on conflict (surveyed_unit_description) do update set
  sr_no = excluded.sr_no,
  lamp_type = excluded.lamp_type,
  conv_led = excluded.conv_led,
  location_type = excluded.location_type,
  shape_size_base = excluded.shape_size_base,
  length_width_diameter = excluded.length_width_diameter,
  lamps_per_fixture = excluded.lamps_per_fixture,
  wattage_w = excluded.wattage_w,
  lumens_lm = excluded.lumens_lm
where (t.sr_no, t.lamp_type, t.conv_led, t.location_type, t.shape_size_base, t.length_width_diameter, t.lamps_per_fixture, t.wattage_w, t.lumens_lm)
   is distinct from (excluded.sr_no, excluded.lamp_type, excluded.conv_led, excluded.location_type, excluded.shape_size_base, excluded.length_width_diameter, excluded.lamps_per_fixture, excluded.wattage_w, excluded.lumens_lm);

-- >>> CHUNK 11/11 — lighting_baseline_registry rows 201-339 of 339
insert into public.lighting_baseline_registry as t (sr_no, surveyed_unit_description, lamp_type, conv_led, location_type, shape_size_base, length_width_diameter, lamps_per_fixture, wattage_w, lumens_lm) values
(202,'LED_Tube-T8-1.2M-2X-60W','LED_Tube','LED','Interior','T8','1.2M-',2,60,9000),
(203,'LED_Bulb-Fanoos-52X-12W','LED_Bulb','LED','Interior','Fanoos',null,52,12,46800),
(204,'LED_Bulb-Fanoos-24X-12W','LED_Bulb','LED','Interior','Fanoos',null,24,12,21600),
(205,'Conv-CFL-E27-2X-100W','CFL','Conv','Exterior','E27',null,2,100,10000),
(206,'Conv-CFL-E27-2X-18W','CFL','Conv','Interior','E27',null,2,18,1800),
(207,'Conv-CFL-Table Light-1X-40W','CFL','Conv','Interior','Table Light',null,1,40,2000),
(208,'Conv-CFL-Lock-0X-0W','CFL','Conv','Interior','Lock',null,0,0,0),
(209,'Conv-CFL-E27-2X-48W','CFL','Conv','Interior','E27',null,2,48,4800),
(210,'Conv-CFL-Exit Light-1X-8W','CFL','Conv','Interior','Exit Light',null,1,8,400),
(211,'LED_Bulb-Steplight-1X-8W','LED_Bulb','LED','Interior','Steplight',null,1,8,600),
(212,'LED_Bulb-Lutch Light-1X-20W','LED_Bulb','LED','Interior','Lutch Light',null,1,20,1500),
(213,'Conv-CFL-Footlamp-1X-18W','CFL','Conv','Exterior','Footlamp',null,1,18,900),
(214,'Conv-CFL-12" Downlight-1X-80W','CFL','Conv','Interior','12" Downlight',null,1,80,4000),
(215,'LED_Bulb-Floor Light-1X-50W','LED_Bulb','LED','Exterior','Floor Light',null,1,50,3750),
(216,'Conv-MV-E40-1X-55W','MV','Conv','Exterior','E40',null,1,55,1925),
(217,'LED_Bulb-HQL-1X-40W','LED_Bulb','LED','Exterior','HQL',null,1,40,3000),
(218,'Conv-MH--1X-250W','MH','Conv','Exterior',null,null,1,250,12500),
(219,'Conv-MH--1X-1000W','MH','Conv','Exterior',null,null,1,1000,50000),
(220,'LED_Flood_Light--1X-40W','LED_Flood_Light','LED','Exterior',null,null,1,40,3200),
(221,'Conv-MH--1X-800W','MH','Conv','Exterior',null,null,1,800,40000),
(222,'Conv-MH-E40 High Bay-1X-200W','MH','Conv','Exterior','E40 High Bay',null,1,200,10000),
(223,'LED_Panel_light-60X60-1X-55W','LED_Panel_light','LED','Interior','60X60',null,1,55,4125),
(224,'LED_Panel_light-60X60-1X-50W','LED_Panel_light','LED','Interior','60X60',null,1,50,3750),
(225,'LED_Downlight-4"-1X-26W','LED_Downlight','LED','Interior','4"',null,1,26,1950),
(226,'Conv-Halogen-6"-1X-200W','Halogen','Conv','Interior','6"',null,1,200,2000),
(227,'Conv-Halogen-6"-1X-30W','Halogen','Conv','Interior','6"',null,1,30,300),
(228,'Conv-Halogen-6"-1X-28W','Halogen','Conv','Interior','6"',null,1,28,280),
(229,'LED_Downlight-6"-1X-15W','LED_Downlight','LED','Interior','6"',null,1,15,1125),
(230,'LED_Downlight-6"-1X-12W','LED_Downlight','LED','Interior','6"',null,1,12,900),
(231,'LED_Downlight-8"-1X-18W','LED_Downlight','LED','Interior','8"',null,1,18,1350),
(232,'Conv-Halogen-6"-1X-60W','Halogen','Conv','Interior','6"',null,1,60,600),
(233,'Conv-Halogen-6"-1X-100W','Halogen','Conv','Interior','6"',null,1,100,1000),
(234,'LED_Downlight-3"-1X-10W','LED_Downlight','LED','Interior','3"',null,1,10,750),
(235,'LED_Downlight-3"-1X-4.5W','LED_Downlight','LED','Interior','3"',null,1,4.5,337.5),
(236,'LED_Bulb-E27-1X-50W','LED_Bulb','LED','Interior','E27',null,1,50,3750),
(237,'Conv-Halogen--1X-35W','Halogen','Conv','Interior',null,null,1,35,350),
(238,'Conv-CFL-Downlight -2X-36W','CFL','Conv','Interior','Downlight ',null,2,36,3600),
(239,'Conv-CFL-Pole Lamp-1X-100W','CFL','Conv','Interior','Pole Lamp',null,1,100,5000),
(240,'Conv-CFL-12" -3X-26W','CFL','Conv','Interior','12" ',null,3,26,3900),
(241,'Conv-CFL--3X-12W','CFL','Conv','Interior',null,null,3,12,1800),
(242,'Conv-CFL--2X-20W','CFL','Conv','Interior',null,null,2,20,2000),
(243,'Conv-CFL--2X-28W','CFL','Conv','Interior',null,null,2,28,2800),
(244,'Conv-CFL-12" E27-3X-15W','CFL','Conv','Interior','12" E27',null,3,15,2250),
(245,'Conv-CFL--2X-12W','CFL','Conv','Interior',null,null,2,12,1200),
(246,'LED_Bulb--20X-12W','LED_Bulb','LED','Interior',null,null,20,12,18000),
(247,'LED_Bulb--1X-18W','LED_Bulb','LED','Interior',null,null,1,18,1350),
(248,'LED_Bulb--1X-30W','LED_Bulb','LED','Interior',null,null,1,30,2250),
(249,'LED_Tube--0.6M-2X-10W','LED_Tube','LED','Interior',null,'0.6M-',2,10,1500),
(250,'Conv-FTL--0.6M-2X-22W','FTL','Conv','Interior',null,'0.6M-',2,22,2200),
(251,'Conv-FTL--0.6M-1X-10W','FTL','Conv','Interior',null,'0.6M-',1,10,500),
(252,'LED_Tube--0.6M-1X-10W','LED_Tube','LED','Interior',null,'0.6M-',1,10,750),
(253,'LED_Tube-T20-0.6M-1X-30W','LED_Tube','LED','Interior','T20','0.6M-',1,30,2250),
(254,'LED_Tube-T20-0.6M-1X-34W','LED_Tube','LED','Interior','T20','0.6M-',1,34,2550),
(255,'LED_Tube-T8-1.2M-3X-22W','LED_Tube','LED','Interior','T8','1.2M-',3,22,4950),
(256,'LED_Tube-T8-1.2M-2X-22W','LED_Tube','LED','Interior','T8','1.2M-',2,22,3300),
(257,'Conv-FTL-T8-1.2M-2X-22W','FTL','Conv','Interior','T8','1.2M-',2,22,2200),
(258,'LED_Tube-T8-1.2M-2X-50W','LED_Tube','LED','Interior','T8','1.2M-',2,50,7500),
(259,'LED_Tube-T8-1.2M-8X-50W','LED_Tube','LED','Interior','T8','1.2M-',8,50,30000),
(260,'LED_Tube-T8-1.2M-1X-50W','LED_Tube','LED','Interior','T8','1.2M-',1,50,3750),
(261,'LED_Tube-T8-1.2M-6X-50W','LED_Tube','LED','Interior','T8','1.2M-',6,50,22500),
(262,'LED_Tube-T8-1.2M-3X-50W','LED_Tube','LED','Interior','T8','1.2M-',3,50,11250),
(263,'LED_Tube-T8-1.2M-4X-50W','LED_Tube','LED','Interior','T8','1.2M-',4,50,15000),
(264,'LED_Tube-T8-1.2M-11X-20W','LED_Tube','LED','Interior','T8','1.2M-',11,20,16500),
(265,'Conv-FTL-T8-1.2M-3X-48W','FTL','Conv','Interior','T8','1.2M-',3,48,7200),
(266,'Conv-FTL-T8-1.2M-1X-60W','FTL','Conv','Interior','T8','1.2M-',1,60,3000),
(268,'LED_Tube-T5-1.5m2X-37W','LED_Tube','LED','Interior','T5','1.5m',2,37,5550),
(269,'LED_Downlight-3"-1X-7W','LED_Downlight','LED','Interior','3"',null,1,7,525),
(270,'LED_Downlight-6"-1X-18W','LED_Downlight','LED','Interior','6"',null,1,18,1350),
(271,'LED_Downlight-surface 10"-1X-20W','LED_Downlight','LED','Interior','surface 10"',null,1,20,1500),
(272,'LED_Downlight-surface 10"-1X-35W','LED_Downlight','LED','Interior','surface 10"',null,1,35,2625),
(273,'LED_Downlight-surface 8"-1X-18W','LED_Downlight','LED','Interior','surface 8"',null,1,18,1350),
(274,'Conv-Halogen-E27-1X-100W','Halogen','Conv','Interior','E27',null,1,100,1000),
(275,'Conv-CFL-Bulb E27-1X-14W','CFL','Conv','Interior','Bulb E27',null,1,14,700),
(276,'Conv-MH-Bulb E27-1X-35W','MH','Conv','Interior','Bulb E27',null,1,35,1750),
(277,'Conv-Incandescent-High Bay-1X-250W','Incandescent','Conv','Interior','High Bay',null,1,250,2500),
(278,'Conv-Halogen-Spot Light-1X-20W','Halogen','Conv','Interior','Spot Light',null,1,20,200),
(279,'Conv-MV-Street Light-1X-150W','MV','Conv','Exterior','Street Light',null,1,150,5250),
(280,'Conv-MH-Street Light-1X-250W','MH','Conv','Exterior','Street Light',null,1,250,12500),
(281,'Conv-MH-Street Light-1X-400W','MH','Conv','Exterior','Street Light',null,1,400,20000),
(282,'Conv-FTL-T8-1.2M-1X-18W','FTL','Conv','Interior','T8','1.2M-',1,18,900),
(283,'Conv-FTL-T8-0.6M-1X-20W','FTL','Conv','Interior','T8','0.6M-',1,20,1000),
(284,'Conv-FTL-T8-1.2M-1X-20W','FTL','Conv','Interior','T8','1.2M-',1,20,1000),
(285,'Conv-FTL-T8-1.2M-1X-28W','FTL','Conv','Interior','T8','1.2M-',1,28,1400),
(286,'Conv-FTL-T8-0.6M-1X-36W','FTL','Conv','Interior','T8','0.6M-',1,36,1800),
(287,'Conv-FTL-T8-0.6M-1X-40W','FTL','Conv','Interior','T8','0.6M-',1,40,2000),
(288,'Conv-FTL-T8-1.2M-1X-40W','FTL','Conv','Interior','T8','1.2M-',1,40,2000),
(289,'LED_Stick- E27-1X-20W','LED_Stick','LED','Interior',' E27',null,1,20,1500),
(290,'LED_Bulb- E27-1X-24W','LED_Bulb','LED','Interior',' E27',null,1,24,1800),
(291,'LED_Bulb- E27-1X-40W','LED_Bulb','LED','Interior',' E27',null,1,40,3000),
(292,'LED_Panel_light-60*60-1X-20W','LED_Panel_light','LED','Interior','60*60',null,1,20,1500),
(293,'LED_Panel_light-60*60-1X-30W','LED_Panel_light','LED','Interior','60*60',null,1,30,2250),
(294,'LED_Panel_light-120*60-1X-72W','LED_Panel_light','LED','Interior','120*60',null,1,72,5400),
(295,'LED_Downlight-Square-10*10-1X-8W','LED_Downlight','LED','Interior','Square','10*10-',1,8,600),
(296,'LED_Downlight-Square-12in-1X-17W','LED_Downlight','LED','Interior','Square','12in-',1,17,1275),
(297,'LED_Downlight-Square-17in-1X-22W','LED_Downlight','LED','Interior','Square','17in-',1,22,1650),
(298,'LED_Downlight-Surface-12in-1X-30W','LED_Downlight','LED','Interior','Surface','12in-',1,30,2250),
(299,'LED_Tube-T8-0.6M-1X-14W','LED_Tube','LED','Interior','T8','0.6M-',1,14,1050),
(300,'LED_Tube-T8-1.2M-1X-14W','LED_Tube','LED','Interior','T8','1.2M-',1,14,1050),
(301,'LED_Tube-T8-1.2M-1X-24W','LED_Tube','LED','Interior','T8','1.2M-',1,24,1800),
(302,'LED_Tube-T8-1.2M-1X-30W','LED_Tube','LED','Interior','T8','1.2M-',1,30,2250),
(303,'Conv-FTL-T8-1.2M-1X-24W','FTL','Conv','Interior','T8','1.2M-',1,24,1200),
(304,'LED_Downlight-8in-1X-15W','LED_Downlight','LED','Interior','8in',null,1,15,1125),
(305,'LED_Downlight-Surface 6in-1X-18W','LED_Downlight','LED','Interior','Surface 6in',null,1,18,1350),
(306,'LED_Downlight-Surface 6in-1X-20W','LED_Downlight','LED','Interior','Surface 6in',null,1,20,1500),
(307,'LED_Downlight-Surface 8in-1X-30W','LED_Downlight','LED','Interior','Surface 8in',null,1,30,2250),
(308,'LED_Bulb-E27-1X-18W','LED_Bulb','LED','Interior','E27',null,1,18,1350),
(309,'LED_Bulb-E27-1X-30W','LED_Bulb','LED','Interior','E27',null,1,30,2250),
(310,'Conv-Halogen-DL Celinder-1X-100W','Halogen','Conv','Interior','DL Celinder',null,1,100,1000),
(312,'Conv-CFL-E27-Street-1X-40W','CFL','Conv','Exterior','E27','Street-',1,40,2000),
(313,'Conv-CFL-E27-1X-35W','CFL','Conv','Interior','E27',null,1,35,1750),
(314,'Conv-Candle-E14-1x-10W','Candle','Conv','Interior','E14',null,1,10,100),
(316,'Conv-Candle-E14-1X-6W','Candle','Conv','Interior','E14',null,1,6,60),
(317,'LED_Bulb-E27-1X-24W','LED_Bulb','LED','Interior','E27',null,1,24,1800),
(319,'Conv-Halogen-High Bay-1X-100W','Halogen','Conv','Interior','High Bay',null,1,100,1000),
(320,'LED_High_Bay--1X-150W','LED_High_Bay','LED','Interior',null,null,1,150,12000),
(321,'Conv-Halogen-FloodLight-1X-200W','Halogen','Conv','Exterior','FloodLight',null,1,200,2000),
(322,'Conv-MH-FloodLight-1X-65W','MH','Conv','Exterior','FloodLight',null,1,65,3250),
(323,'LED_High_Bay--1X-400W','LED_High_Bay','LED','Interior',null,null,1,400,32000),
(324,'Conv-MH-HQL-E40-1X-400W','MH','Conv','Exterior','HQL','E40-',1,400,20000),
(325,'LED_Bulb-HQL-E27-1X-250W','LED_Bulb','LED','Exterior','HQL','E27-',1,250,18750),
(326,'LED_Downlight-4"-1X-10W','LED_Downlight','LED','Interior','4"',null,1,10,750),
(327,'Conv-MH-High Bay-1X-400W','MH','Conv','Interior','High Bay',null,1,400,20000),
(328,'Conv-MV-E27-Bulb-1X-60W','MV','Conv','Exterior','E27','Bulb-',1,60,2100),
(329,'LED_Bulb-HQL-E27-1X-80W','LED_Bulb','LED','Exterior','HQL','E27-',1,80,6000),
(330,'LED_Bulb-HQL-E27-1X-125W','LED_Bulb','LED','Exterior','HQL','E27-',1,125,9375),
(331,'LED_Bulb-HQL-E40-1X-250W','LED_Bulb','LED','Exterior','HQL','E40-',1,250,18750),
(332,'Conv-MH-FloodLight-1X-400W','MH','Conv','Exterior','FloodLight',null,1,400,20000),
(333,'LED_Flood_Light--1X-600W','LED_Flood_Light','LED','Exterior',null,null,1,600,48000),
(334,'Conv-MH-HQL-E40-1X-250W','MH','Conv','Exterior','HQL','E40-',1,250,12500),
(335,'LED_Downlight-6"-1X-30W','LED_Downlight','LED','Exterior','6"',null,1,30,2250),
(336,'LED_Bulb-HW-E27-1X-100W','LED_Bulb','LED','Interior','HW','E27-',1,100,7500),
(337,'LED_Candle_Light-E14-1X-3W','LED_Candle_Light','LED','Interior','E14',null,1,3,210),
(338,'Conv-FTL-T8-1.2M-1X-14W','FTL','Conv','Interior','T8','1.2M-',1,14,700),
(339,'Conv-FTL-T8-1.2M-1X-16W','FTL','Conv','Interior','T8','1.2M-',1,16,800),
(340,'Conv-HPS-Street Light-1X-200W','HPS','Conv','Exterior','Street Light',null,1,200,10000),
(341,'Conv-MH-High Bay-1X-100W','MH','Conv','Interior','High Bay',null,1,100,5000),
(342,'LED_Bulb-E27-1X-10W','LED_Bulb','LED','Interior','E27',null,1,10,750),
(343,'LED_Panel_light-60x60-1X-68W','LED_Panel_light','LED','Interior','60x60',null,1,68,5100),
(344,'LED_Candle_Light-E14-1X-5W','LED_Candle_Light','LED','Interior','E14',null,1,5,350)
on conflict (surveyed_unit_description) do update set
  sr_no = excluded.sr_no,
  lamp_type = excluded.lamp_type,
  conv_led = excluded.conv_led,
  location_type = excluded.location_type,
  shape_size_base = excluded.shape_size_base,
  length_width_diameter = excluded.length_width_diameter,
  lamps_per_fixture = excluded.lamps_per_fixture,
  wattage_w = excluded.wattage_w,
  lumens_lm = excluded.lumens_lm
where (t.sr_no, t.lamp_type, t.conv_led, t.location_type, t.shape_size_base, t.length_width_diameter, t.lamps_per_fixture, t.wattage_w, t.lumens_lm)
   is distinct from (excluded.sr_no, excluded.lamp_type, excluded.conv_led, excluded.location_type, excluded.shape_size_base, excluded.length_width_diameter, excluded.lamps_per_fixture, excluded.wattage_w, excluded.lumens_lm);

-- --------------------------------------------------------------------------
-- Proof (0128/0131 idiom). Counts, uniqueness, ten spot rows per table
-- asserted cell-for-cell against the artefact, and the recorded wart.
-- --------------------------------------------------------------------------
do $$
declare n int; s text;
begin
  select count(*) into n from public.old_model_registry;
  if n <> 1516 then raise exception 'FAIL: old_model_registry has % rows, expected 1516', n; end if;
  select count(*) into n from public.approved_baseline_units;
  if n <> 194 then raise exception 'FAIL: approved_baseline_units has % rows, expected 194', n; end if;
  select count(*) into n from public.lighting_baseline_registry;
  if n <> 339 then raise exception 'FAIL: lighting_baseline_registry has % rows, expected 339', n; end if;

  select count(*) into n from (select equipment_type, model_no from public.old_model_registry
                               group by equipment_type, model_no having count(*) > 1) d;
  if n <> 0 then raise exception 'FAIL: old_model_registry has % duplicate key(s)', n; end if;
  select count(*) into n from (select equipment_type, model_no from public.approved_baseline_units
                               group by equipment_type, model_no having count(*) > 1) d;
  if n <> 0 then raise exception 'FAIL: approved_baseline_units has % duplicate key(s)', n; end if;
  select count(*) into n from (select surveyed_unit_description from public.lighting_baseline_registry
                               group by surveyed_unit_description having count(*) > 1) d;
  if n <> 0 then raise exception 'FAIL: lighting_baseline_registry has % duplicate key(s)', n; end if;
  raise notice 'PASS: row counts are old_model_registry=1516, approved_baseline_units=194, lighting_baseline_registry=339 and every natural key is unique';

  select count(*) into n from public.old_model_registry where equipment_type = 'Window' and model_no = 'B182C'
    and make is not distinct from 'LG'
    and compressor_type is not distinct from 'Non-Inverter'
    and size_category is not distinct from '2'
    and tr is not distinct from 2
    and t1_btu is not distinct from 24000
    and t1_w is not distinct from 2500
    and t1_eer is not distinct from 9.6
    and t3_btu is not distinct from 21000
    and t3_w is not distinct from 3000
    and t3_eer is not distinct from 7
    and equivalent_seer is not distinct from 8.2099999999999991
    and surveyed_unit_description is not distinct from 'Window LG 2TR SEER 8.21'
    and equivalent_ac_model_description is not distinct from 'Window LG 2TR SEER 7.48';
  if n <> 1 then raise exception 'FAIL spot-check old_model_registry sheet row 3: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.old_model_registry where equipment_type = 'Split_Wall_Mounted' and model_no = 'MIS-320-HP'
    and make is not distinct from 'Royal_Temp'
    and compressor_type is not distinct from 'Non-Inverter'
    and size_category is not distinct from '2.5'
    and tr is not distinct from 2.66
    and t1_btu is not distinct from 32000
    and t1_w is not distinct from 3720
    and t1_eer is not distinct from 8.6021505376344081
    and t3_btu is not distinct from 26380
    and t3_w is not distinct from 3937
    and t3_eer is not distinct from 6.7005334010668021
    and equivalent_seer is not distinct from 7.45
    and surveyed_unit_description is not distinct from 'Split_Wall_Mounted Royal_Temp 2.66TR SEER 7.45'
    and equivalent_ac_model_description is not distinct from 'Split_Wall_Mounted Royal Temp 2.67TR SEER 7.44';
  if n <> 1 then raise exception 'FAIL spot-check old_model_registry sheet row 171: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.old_model_registry where equipment_type = 'Split_Wall_Mounted' and model_no = 'B2424C'
    and make is not distinct from 'LG'
    and compressor_type is not distinct from 'Non-Inverter'
    and size_category is not distinct from '2'
    and tr is not distinct from 1.82
    and t1_btu is not distinct from 21871.83022
    and t1_w is not distinct from 1900
    and t1_eer is not distinct from 11.511489589473683
    and t3_btu is not distinct from 18971.50952
    and t3_w is not distinct from 2290
    and t3_eer is not distinct from 8.2845019737991272
    and equivalent_seer is not distinct from 9.7999999999999989
    and surveyed_unit_description is not distinct from 'Split_Wall_Mounted LG 1.82TR SEER 9.8'
    and equivalent_ac_model_description is not distinct from 'Split_Wall_Mounted Supergeneral 1.83TR SEER 10.43';
  if n <> 1 then raise exception 'FAIL spot-check old_model_registry sheet row 339: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.old_model_registry where equipment_type = 'Split_Wall_Mounted' and model_no = 'WBAC18LH'
    and make is not distinct from 'SAMSUNG'
    and compressor_type is not distinct from 'Non-Inverter'
    and size_category is not distinct from '1.5'
    and tr is not distinct from 1.44
    and t1_btu is not distinct from 17300
    and t1_w is not distinct from 1400
    and t1_eer is not distinct from 12.357142857142858
    and t3_btu is not distinct from 14700
    and t3_w is not distinct from 1680
    and t3_eer is not distinct from 8.75
    and equivalent_seer is not distinct from 10.459999999999999
    and surveyed_unit_description is not distinct from 'Split_Wall_Mounted SAMSUNG 1.44TR SEER 10.46'
    and equivalent_ac_model_description is not distinct from 'Split_Wall_Mounted Zamil 1.49TR SEER 10.96';
  if n <> 1 then raise exception 'FAIL spot-check old_model_registry sheet row 508: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.old_model_registry where equipment_type = 'Split_Wall_Mounted' and model_no = '42EQG024-3'
    and make is not distinct from 'Carrier'
    and compressor_type is not distinct from 'Non-Inverter'
    and size_category is not distinct from '2'
    and tr is not distinct from 1.75
    and t1_btu is not distinct from 21000
    and t1_w is not distinct from 2330
    and t1_eer is not distinct from 9.0128755364806867
    and t3_btu is not distinct from null
    and t3_w is not distinct from null
    and t3_eer is not distinct from null
    and equivalent_seer is not distinct from null
    and surveyed_unit_description is not distinct from null
    and equivalent_ac_model_description is not distinct from 'Split_Wall_Mounted Carrier 1.79TR SEER 8.31';
  if n <> 1 then raise exception 'FAIL spot-check old_model_registry sheet row 676: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.old_model_registry where equipment_type = 'Split_Ceiling_Cassette' and model_no = 'S322GHSD3'
    and make is not distinct from 'LG'
    and compressor_type is not distinct from 'Non-Inverter'
    and size_category is not distinct from '2'
    and tr is not distinct from 2.2000000000000002
    and t1_btu is not distinct from 26478.22192
    and t1_w is not distinct from 3050
    and t1_eer is not distinct from 8.6813842360655737
    and t3_btu is not distinct from 23270.808440000001
    and t3_w is not distinct from 3570
    and t3_eer is not distinct from 6.5184337366946776
    and equivalent_seer is not distinct from 7.49
    and surveyed_unit_description is not distinct from 'Split_Ceiling_Cassette LG 2.2TR SEER 7.49'
    and equivalent_ac_model_description is not distinct from 'Split_Ceiling_Cassette LG 2.31TR SEER 7.39';
  if n <> 1 then raise exception 'FAIL spot-check old_model_registry sheet row 844: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.old_model_registry where equipment_type = 'Split_Wall_Mounted' and model_no = 'GACSH-18H'
    and make is not distinct from 'Galanz'
    and compressor_type is not distinct from 'Non-Inverter'
    and size_category is not distinct from '1.5'
    and tr is not distinct from 1.5
    and t1_btu is not distinct from 18000
    and t1_w is not distinct from 2040
    and t1_eer is not distinct from 8.82
    and t3_btu is not distinct from 8530
    and t3_w is not distinct from 1343.3070866141734
    and t3_eer is not distinct from 6.35
    and equivalent_seer is not distinct from 7.22
    and surveyed_unit_description is not distinct from 'Split_Wall_Mounted Galanz 1.5TR SEER 7.22'
    and equivalent_ac_model_description is not distinct from 'Split_Wall_Mounted LG 1.46TR SEER 7.28';
  if n <> 1 then raise exception 'FAIL spot-check old_model_registry sheet row 1013: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.old_model_registry where equipment_type = 'Split_Floor_Standing' and model_no = 'AP55M2AN'
    and make is not distinct from 'Samsung'
    and compressor_type is not distinct from 'Non-Inverter'
    and size_category is not distinct from '4'
    and tr is not distinct from 4.16
    and t1_btu is not distinct from 50000
    and t1_w is not distinct from null
    and t1_eer is not distinct from null
    and t3_btu is not distinct from null
    and t3_w is not distinct from null
    and t3_eer is not distinct from null
    and equivalent_seer is not distinct from 7.84
    and surveyed_unit_description is not distinct from 'Split_Floor_Standing Samsung 4.16TR SEER 7.84'
    and equivalent_ac_model_description is not distinct from 'Split_Floor_Standing LG 4.35TR SEER 7.05';
  if n <> 1 then raise exception 'FAIL spot-check old_model_registry sheet row 1181: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.old_model_registry where equipment_type = 'Split_Wall_Mounted' and model_no = 'DSA30FE6GR7E'
    and make is not distinct from 'Craft'
    and compressor_type is not distinct from 'Non-Inverter'
    and size_category is not distinct from '2'
    and tr is not distinct from 2.27
    and t1_btu is not distinct from 27300
    and t1_w is not distinct from null
    and t1_eer is not distinct from null
    and t3_btu is not distinct from null
    and t3_w is not distinct from null
    and t3_eer is not distinct from null
    and equivalent_seer is not distinct from null
    and surveyed_unit_description is not distinct from 'Split_Wall_Mounted Craft 2.27TR SEER -'
    and equivalent_ac_model_description is not distinct from 'Split_Wall_Mounted Zamil 2.11TR SEER7.24';
  if n <> 1 then raise exception 'FAIL spot-check old_model_registry sheet row 1349: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.old_model_registry where equipment_type = 'Split_Wall_Mounted' and model_no = 'S182SH N52'
    and make is not distinct from 'LG'
    and compressor_type is not distinct from 'Non-Inverter'
    and size_category is not distinct from '1.5'
    and tr is not distinct from 1.41
    and t1_btu is not distinct from 17026
    and t1_w is not distinct from 2100
    and t1_eer is not distinct from 8.1
    and t3_btu is not distinct from 14672
    and t3_w is not distinct from 2450
    and t3_eer is not distinct from 5.9885714285714284
    and equivalent_seer is not distinct from 6.95
    and surveyed_unit_description is not distinct from 'Split_Wall_Mounted LG 1.41TR SEER 6.95'
    and equivalent_ac_model_description is not distinct from 'Split_Wall_Mounted LG 1.41TR SEER 6.94';
  if n <> 1 then raise exception 'FAIL spot-check old_model_registry sheet row 1518: row absent or a column differs from the artefact'; end if;
  raise notice 'PASS: 10 spot rows of old_model_registry match the artefact cell for cell';

  select count(*) into n from public.approved_baseline_units where equipment_type = 'Split_Wall_Mounted' and model_no = 'S122DH'
    and description is not distinct from 'Split_Wall_Mounted LG 0.95TR SEER 7.9'
    and make is not distinct from 'LG'
    and t1_btu is not distinct from 11498
    and t1_w is not distinct from 1200
    and t1_eer is not distinct from 9.58
    and t3_btu is not distinct from 8871
    and t3_w is not distinct from 1400
    and t3_eer is not distinct from 6.34
    and equivalent_seer is not distinct from 7.9
    and nameplate_ref is not distinct from 'Same as description'
    and datasheet_ref is not distinct from 'Same as description';
  if n <> 1 then raise exception 'FAIL spot-check approved_baseline_units sheet row 2: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.approved_baseline_units where equipment_type = 'Split_Wall_Mounted' and model_no = 'GC-18KFC'
    and description is not distinct from 'Split_Wall_Mounted General 1.5TR SEER 10.16'
    and make is not distinct from 'General'
    and t1_btu is not distinct from 18000
    and t1_w is not distinct from 1500
    and t1_eer is not distinct from 12
    and t3_btu is not distinct from 15500
    and t3_w is not distinct from 1824
    and t3_eer is not distinct from 8.5
    and equivalent_seer is not distinct from 10.16
    and nameplate_ref is not distinct from 'Same as description'
    and datasheet_ref is not distinct from 'Same as description';
  if n <> 1 then raise exception 'FAIL spot-check approved_baseline_units sheet row 23: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.approved_baseline_units where equipment_type = 'Split_Wall_Mounted' and model_no = 'GIANT-24C'
    and description is not distinct from 'Split_Wall_Mounted Giant 1.75TR SEER 10.36'
    and make is not distinct from 'Giant'
    and t1_btu is not distinct from 21000
    and t1_w is not distinct from 1750
    and t1_eer is not distinct from 12
    and t3_btu is not distinct from 18900
    and t3_w is not distinct from 2100
    and t3_eer is not distinct from 9
    and equivalent_seer is not distinct from 10.36
    and nameplate_ref is not distinct from 'Same as description'
    and datasheet_ref is not distinct from 'Same as description';
  if n <> 1 then raise exception 'FAIL spot-check approved_baseline_units sheet row 44: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.approved_baseline_units where equipment_type = 'Split_Wall_Mounted' and model_no = 'S242NH ST0'
    and description is not distinct from 'Split_Wall_Mounted LG 1.58TR SEER 7.54'
    and make is not distinct from 'LG'
    and t1_btu is not distinct from 22996.87233437589
    and t1_w is not distinct from 2630
    and t1_eer is not distinct from 8.74
    and t3_btu is not distinct from 20062.553312482229
    and t3_w is not distinct from 3035
    and t3_eer is not distinct from 6.61
    and equivalent_seer is not distinct from 7.54
    and nameplate_ref is not distinct from 'Same as description'
    and datasheet_ref is not distinct from 'Same as description';
  if n <> 1 then raise exception 'FAIL spot-check approved_baseline_units sheet row 66: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.approved_baseline_units where equipment_type = 'Split_Wall_Mounted' and model_no = 'PK-2.5FLD'
    and description is not distinct from 'Split_Wall_Mounted MITSUBISHI 2.03TR SEER 7.10'
    and make is not distinct from 'MITSUBISHI'
    and t1_btu is not distinct from 24400
    and t1_w is not distinct from 3010
    and t1_eer is not distinct from 8.11
    and t3_btu is not distinct from 22700
    and t3_w is not distinct from 3540
    and t3_eer is not distinct from 6.41
    and equivalent_seer is not distinct from 7.12
    and nameplate_ref is not distinct from 'Same as description'
    and datasheet_ref is not distinct from 'Same as description';
  if n <> 1 then raise exception 'FAIL spot-check approved_baseline_units sheet row 87: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.approved_baseline_units where equipment_type = 'Split_Wall_Mounted' and model_no = '42QHB030HS'
    and description is not distinct from 'Split_Wall_Mounted Carrier 2.58TR SEER 10.41'
    and make is not distinct from 'Carrier'
    and t1_btu is not distinct from 31000
    and t1_w is not distinct from 2520
    and t1_eer is not distinct from 12.3
    and t3_btu is not distinct from 26500
    and t3_w is not distinct from 3050
    and t3_eer is not distinct from 8.69
    and equivalent_seer is not distinct from 10.41
    and nameplate_ref is not distinct from 'Same as description'
    and datasheet_ref is not distinct from 'Same as description';
  if n <> 1 then raise exception 'FAIL spot-check approved_baseline_units sheet row 109: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.approved_baseline_units where equipment_type = 'Split_Ceiling_Cassette' and model_no = 'ATUW48GMLT0SA0'
    and description is not distinct from 'Split_Ceiling_Cassette LG 3.83TR SEER 9.87'
    and make is not distinct from 'LG'
    and t1_btu is not distinct from 45993.74466875178
    and t1_w is not distinct from 3960
    and t1_eer is not distinct from 11.61
    and t3_btu is not distinct from 39067.386977537673
    and t3_w is not distinct from 4660
    and t3_eer is not distinct from 8.3800000000000008
    and equivalent_seer is not distinct from 9.8699999999999992
    and nameplate_ref is not distinct from 'Same as description'
    and datasheet_ref is not distinct from 'Same as description';
  if n <> 1 then raise exception 'FAIL spot-check approved_baseline_units sheet row 130: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.approved_baseline_units where equipment_type = 'Split_Ceiling_Ducted' and model_no = 'YE3SD18OSHBW22-VH'
    and description is not distinct from 'Split_Ceiling_Ducted YORK 1.5TR SEER 6.41'
    and make is not distinct from 'YORK'
    and t1_btu is not distinct from 18000
    and t1_w is not distinct from 2390
    and t1_eer is not distinct from 7.53
    and t3_btu is not distinct from 15480
    and t3_w is not distinct from 2850
    and t3_eer is not distinct from 5.43
    and equivalent_seer is not distinct from 6.41
    and nameplate_ref is not distinct from 'Same as description'
    and datasheet_ref is not distinct from 'Same as description';
  if n <> 1 then raise exception 'FAIL spot-check approved_baseline_units sheet row 152: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.approved_baseline_units where equipment_type = 'Window' and model_no = 'W242EH'
    and description is not distinct from 'Window LG 2TR SEER 7.48'
    and make is not distinct from 'LG'
    and t1_btu is not distinct from 24000
    and t1_w is not distinct from 2560
    and t1_eer is not distinct from 9.3800000000000008
    and t3_btu is not distinct from 16206
    and t3_w is not distinct from 2880
    and t3_eer is not distinct from 5.63
    and equivalent_seer is not distinct from 7.48
    and nameplate_ref is not distinct from 'Same as Description'
    and datasheet_ref is not distinct from 'Same as Description';
  if n <> 1 then raise exception 'FAIL spot-check approved_baseline_units sheet row 173: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.approved_baseline_units where equipment_type = 'Window' and model_no = '51HSD243MA0C'
    and description is not distinct from 'Window Carrier 2.02TR SEER 7.57'
    and make is not distinct from 'Carrier'
    and t1_btu is not distinct from 24200
    and t1_w is not distinct from 2674
    and t1_eer is not distinct from 9.0500000000000007
    and t3_btu is not distinct from 18700
    and t3_w is not distinct from 2968
    and t3_eer is not distinct from 6.3
    and equivalent_seer is not distinct from 7.57
    and nameplate_ref is not distinct from 'Same as Description'
    and datasheet_ref is not distinct from 'Same as Description';
  if n <> 1 then raise exception 'FAIL spot-check approved_baseline_units sheet row 195: row absent or a column differs from the artefact'; end if;
  raise notice 'PASS: 10 spot rows of approved_baseline_units match the artefact cell for cell';

  select count(*) into n from public.lighting_baseline_registry where surveyed_unit_description = 'Conv-FTL-T8-1.5M-1X-56W'
    and sr_no is not distinct from 1
    and lamp_type is not distinct from 'FTL'
    and conv_led is not distinct from 'Conv'
    and location_type is not distinct from 'Interior'
    and shape_size_base is not distinct from 'T8'
    and length_width_diameter is not distinct from '1.5M-'
    and lamps_per_fixture is not distinct from 1
    and wattage_w is not distinct from 56
    and lumens_lm is not distinct from 2800;
  if n <> 1 then raise exception 'FAIL spot-check lighting_baseline_registry sheet row 2: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.lighting_baseline_registry where surveyed_unit_description = 'Conv-CFL-E27-1X-16W'
    and sr_no is not distinct from 38
    and lamp_type is not distinct from 'CFL'
    and conv_led is not distinct from 'Conv'
    and location_type is not distinct from 'Interior'
    and shape_size_base is not distinct from 'E27'
    and length_width_diameter is not distinct from null
    and lamps_per_fixture is not distinct from 1
    and wattage_w is not distinct from 16
    and lumens_lm is not distinct from 800;
  if n <> 1 then raise exception 'FAIL spot-check lighting_baseline_registry sheet row 39: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.lighting_baseline_registry where surveyed_unit_description = 'Conv-Halogen-Flood Light-1X-200W'
    and sr_no is not distinct from 77
    and lamp_type is not distinct from 'Halogen'
    and conv_led is not distinct from 'Conv'
    and location_type is not distinct from 'Exterior'
    and shape_size_base is not distinct from 'Flood Light'
    and length_width_diameter is not distinct from null
    and lamps_per_fixture is not distinct from 1
    and wattage_w is not distinct from 200
    and lumens_lm is not distinct from 2000;
  if n <> 1 then raise exception 'FAIL spot-check lighting_baseline_registry sheet row 78: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.lighting_baseline_registry where surveyed_unit_description = 'LED_Tube-T8-0.6M-4X-18W'
    and sr_no is not distinct from 114
    and lamp_type is not distinct from 'LED_Tube'
    and conv_led is not distinct from 'LED'
    and location_type is not distinct from 'Interior'
    and shape_size_base is not distinct from 'T8'
    and length_width_diameter is not distinct from '0.6M-'
    and lamps_per_fixture is not distinct from 4
    and wattage_w is not distinct from 18
    and lumens_lm is not distinct from 5400;
  if n <> 1 then raise exception 'FAIL spot-check lighting_baseline_registry sheet row 115: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.lighting_baseline_registry where surveyed_unit_description = 'Conv-CFL-2Pin-1X-18W'
    and sr_no is not distinct from 152
    and lamp_type is not distinct from 'CFL'
    and conv_led is not distinct from 'Conv'
    and location_type is not distinct from 'Interior'
    and shape_size_base is not distinct from '2Pin'
    and length_width_diameter is not distinct from null
    and lamps_per_fixture is not distinct from 1
    and wattage_w is not distinct from 18
    and lumens_lm is not distinct from 900;
  if n <> 1 then raise exception 'FAIL spot-check lighting_baseline_registry sheet row 153: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.lighting_baseline_registry where surveyed_unit_description = 'LED_Bulb-E29-1X-7W'
    and sr_no is not distinct from 189
    and lamp_type is not distinct from 'LED_Bulb'
    and conv_led is not distinct from 'LED'
    and location_type is not distinct from 'Interior'
    and shape_size_base is not distinct from 'E29'
    and length_width_diameter is not distinct from null
    and lamps_per_fixture is not distinct from 1
    and wattage_w is not distinct from 7
    and lumens_lm is not distinct from 525;
  if n <> 1 then raise exception 'FAIL spot-check lighting_baseline_registry sheet row 190: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.lighting_baseline_registry where surveyed_unit_description = 'Conv-Halogen-6"-1X-30W'
    and sr_no is not distinct from 227
    and lamp_type is not distinct from 'Halogen'
    and conv_led is not distinct from 'Conv'
    and location_type is not distinct from 'Interior'
    and shape_size_base is not distinct from '6"'
    and length_width_diameter is not distinct from null
    and lamps_per_fixture is not distinct from 1
    and wattage_w is not distinct from 30
    and lumens_lm is not distinct from 300;
  if n <> 1 then raise exception 'FAIL spot-check lighting_baseline_registry sheet row 228: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.lighting_baseline_registry where surveyed_unit_description = 'LED_Tube-T8-1.2M-11X-20W'
    and sr_no is not distinct from 264
    and lamp_type is not distinct from 'LED_Tube'
    and conv_led is not distinct from 'LED'
    and location_type is not distinct from 'Interior'
    and shape_size_base is not distinct from 'T8'
    and length_width_diameter is not distinct from '1.2M-'
    and lamps_per_fixture is not distinct from 11
    and wattage_w is not distinct from 20
    and lumens_lm is not distinct from 16500;
  if n <> 1 then raise exception 'FAIL spot-check lighting_baseline_registry sheet row 265: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.lighting_baseline_registry where surveyed_unit_description = 'Conv-FTL-T8-1.2M-1X-24W'
    and sr_no is not distinct from 303
    and lamp_type is not distinct from 'FTL'
    and conv_led is not distinct from 'Conv'
    and location_type is not distinct from 'Interior'
    and shape_size_base is not distinct from 'T8'
    and length_width_diameter is not distinct from '1.2M-'
    and lamps_per_fixture is not distinct from 1
    and wattage_w is not distinct from 24
    and lumens_lm is not distinct from 1200;
  if n <> 1 then raise exception 'FAIL spot-check lighting_baseline_registry sheet row 304: row absent or a column differs from the artefact'; end if;
  select count(*) into n from public.lighting_baseline_registry where surveyed_unit_description = 'LED_Candle_Light-E14-1X-5W'
    and sr_no is not distinct from 344
    and lamp_type is not distinct from 'LED_Candle_Light'
    and conv_led is not distinct from 'LED'
    and location_type is not distinct from 'Interior'
    and shape_size_base is not distinct from 'E14'
    and length_width_diameter is not distinct from null
    and lamps_per_fixture is not distinct from 1
    and wattage_w is not distinct from 5
    and lumens_lm is not distinct from 350;
  if n <> 1 then raise exception 'FAIL spot-check lighting_baseline_registry sheet row 345: row absent or a column differs from the artefact'; end if;
  raise notice 'PASS: 10 spot rows of lighting_baseline_registry match the artefact cell for cell';

  select surveyed_unit_description into s from public.lighting_baseline_registry
   where surveyed_unit_description like 'Conv-Candle-E14-1%-10W';
  if s <> 'Conv-Candle-E14-1x-10W' then
    raise exception 'FAIL: the lighting row-315 wart was normalised — expected the lower-case "1x", found %', s;
  end if;
  raise notice 'PASS: the row-315 wart survived import verbatim — %', s;

  select count(*) into n from public.old_model_registry where equivalent_seer is null;
  if n <> 393 then raise exception 'FAIL: expected 393 null equivalent_seer, found %', n; end if;
  select count(*) into n from public.old_model_registry
   where equivalent_seer is null and compressor_type = 'Inverter';
  if n < 11 then raise exception 'FAIL: the inverter rows lost their compressor_type — the "Inverter" SEER text is only safe to null because that column keeps the fact'; end if;
  raise notice 'PASS: equivalent_seer is NULL on 393 rows (109 textual + 284 empty) and compressor_type still names every inverter unit';

  -- verbatim proof: the four AC model_no values that carry stray spaces are
  -- still carrying them. If a normaliser ever creeps in, this fails first.
  select count(*) into n from public.old_model_registry
   where model_no <> btrim(regexp_replace(model_no, '\s+', ' ', 'g'));
  if n <> 4 then raise exception 'FAIL: expected 4 model_no values with stray whitespace (verbatim import), found %', n; end if;
  raise notice 'PASS: model_no imported verbatim — the 4 whitespace warts are intact, so no two rows were merged';

  -- the whole-content digests: every cell of every row, compared with the
  -- value the script computed straight from the .xlsx.
  select md5(string_agg(rd, '' order by rd collate "C")) into s from (
    select md5(concat_ws(chr(31), coalesce(equipment_type::text,'\N'), coalesce(make::text,'\N'), coalesce(model_no::text,'\N'), coalesce(compressor_type::text,'\N'), coalesce(size_category::text,'\N'), coalesce(tr::text,'\N'), coalesce(t1_btu::text,'\N'), coalesce(t1_w::text,'\N'), coalesce(t1_eer::text,'\N'), coalesce(t3_btu::text,'\N'), coalesce(t3_w::text,'\N'), coalesce(t3_eer::text,'\N'), coalesce(equivalent_seer::text,'\N'), coalesce(surveyed_unit_description::text,'\N'), coalesce(equivalent_ac_model_description::text,'\N'))) rd from public.old_model_registry) x;
  if s <> 'b66c7a49c0363dfddef7f3b74039e118' then
    raise exception 'FAIL: old_model_registry content digest is % but the artefact says b66c7a49c0363dfddef7f3b74039e118 — the table is not what the workbook holds', s;
  end if;
  select md5(string_agg(rd, '' order by rd collate "C")) into s from (
    select md5(concat_ws(chr(31), coalesce(description::text,'\N'), coalesce(equipment_type::text,'\N'), coalesce(make::text,'\N'), coalesce(model_no::text,'\N'), coalesce(t1_btu::text,'\N'), coalesce(t1_w::text,'\N'), coalesce(t1_eer::text,'\N'), coalesce(t3_btu::text,'\N'), coalesce(t3_w::text,'\N'), coalesce(t3_eer::text,'\N'), coalesce(equivalent_seer::text,'\N'), coalesce(nameplate_ref::text,'\N'), coalesce(datasheet_ref::text,'\N'))) rd from public.approved_baseline_units) x;
  if s <> 'a3e5465487cd9d03aa30cd4534b33eab' then
    raise exception 'FAIL: approved_baseline_units content digest is % but the artefact says a3e5465487cd9d03aa30cd4534b33eab — the table is not what the workbook holds', s;
  end if;
  select md5(string_agg(rd, '' order by rd collate "C")) into s from (
    select md5(concat_ws(chr(31), coalesce(sr_no::text,'\N'), coalesce(surveyed_unit_description::text,'\N'), coalesce(lamp_type::text,'\N'), coalesce(conv_led::text,'\N'), coalesce(location_type::text,'\N'), coalesce(shape_size_base::text,'\N'), coalesce(length_width_diameter::text,'\N'), coalesce(lamps_per_fixture::text,'\N'), coalesce(wattage_w::text,'\N'), coalesce(lumens_lm::text,'\N'))) rd from public.lighting_baseline_registry) x;
  if s <> '67adcf4845417dec23321261a4ea8f69' then
    raise exception 'FAIL: lighting_baseline_registry content digest is % but the artefact says 67adcf4845417dec23321261a4ea8f69 — the table is not what the workbook holds', s;
  end if;
  raise notice 'PASS: all three content digests match the artefacts cell for cell';
end $$;
