"""Fighter definitions (body shape, photo, outfit)."""

PEOPLE = {
    'alejandro': dict(
        display='ALEJANDRO', photo='alejandro_foto4.jpg', brow_boost=0.35,
        # height swapped with Rafa at the user's request (1.673 m; was 1.737 m)
        body=dict(gender=1, age=0.655, muscle=0.72, weight=0.42, height=0.4126, proportions=0.75, caucasian=1, african=0, asian=0),
        # arms: the base mesh's upper arm is shorter than the forearm; lengthened so the elbow sits at the waist and
        # the hanging fingertips reach mid-thigh (0.377 x stature)
        mods={'stomach/stomach-pregnant': -0.25, 'torso/torso-scale-horiz': 0.1, 'measure/measure-upperarm-length': 0.7},
        skin='young_lightskinned_male_diffuse3', eyes='brownlight', hair=None, scalp='buzz', hair_color=(0.05, 0.046, 0.043), hair_grey=0.3, hair_color_auto=False,
        hair_cards=dict(comb='topknot', atlas='hair_cards_s.png', width=0.12, n=4600, knot_el=38, bun_r=0.2, bun_cards=210, tail_cards=9, tail_len=0.32, tail_spread=0.1, band_az=60, crown_el=48,
                        layers=[(4600, 0.012, 0.25), (2400, 0.03, 0.45)],
                        hairline=dict(front=20, temple=30, side=18, back=-38)),
        glasses=dict(style='half', color=(0.08, 0.08, 0.09), rim=0.0022),
        outfit='alejandro', depth_scale=0.45, shoes=('shoes05', 'grey_white'), shoes_nb='court_white',
        beard=0.75, beard_color=(58, 55, 52), scalp_density=0.9, scalp_color=(38, 34, 31),
        beard_strand_color=(30, 26, 24), beard_grey=0.25, beard_len=0.0026, beard_layers=6, beard_goatee=0.85, beard_over_photo=0.5, beard_shadow=0.8,
        hairline=dict(front=20, temple=30, side=18, back=-38),
        body_hair=dict(chest=0.8, arms=0.16, legs=0.45), body_hair_color=(45, 38, 34),
        tattoos=[dict(kind='laurel', side='R', at=0.72, size=0.62, facing=(0.3, 0, 1)),
                 dict(kind='face', side='R', at=1.35, size=0.5, facing=(0.2, 0, 1)),
                 dict(kind='1980', side='L', at=0.78, size=0.5, aspect=1.4, facing=(-0.3, 0, 1))],
    ),
    'arnau': dict(
        display='ARNAU', photo='arnau_foto3.jpg', brow_boost=0.3,
        body=dict(gender=1, age=0.34, muscle=0.45, weight=0.72, height=0.72, proportions=0.5, caucasian=1, african=0, asian=0),
        mods={'measure/measure-upperarm-length': 0.58},
        skin='young_lightskinned_male_diffuse', eyes='brownlight', hair='short02', hair_color=(0.2, 0.12, 0.07), scalp=None,
        hair_cards=dict(comb='fringe', atlas='hair_cards_s.png', length=(0.8, 0.42, 0.5), width=0.1, n=3400, lift=0.15, gravity=0.2, stop_brows=True, side_lift=0.48,
                        hairline=dict(front=2, temple=0, side=12, back=-44)),
        glasses=dict(style='thick', color=(0.02, 0.02, 0.02), rim=0.0055),
        outfit='arnau', depth_scale=0.45, shoes=('shoes05', 'black'),
        beard=0.45, beard_color=(52, 38, 28), scalp_density=1.0, scalp_color=(48, 32, 22), scalp_shadow=0.8,
        beard_strand_color=(58, 40, 28), beard_grey=0.0, beard_len=0.0015, beard_layers=5,
    ),
    'camilo': dict(
        display='CAMILO', photo='camilo_foto2.jpg',
        # more muscular at the user's request (2026-09-26; was muscle 0.66, weight 0.4, no muscle modifiers)
        body=dict(gender=1, age=0.515, muscle=0.9, weight=0.47, height=0.5, proportions=0.55, caucasian=1, african=0, asian=0),
        mods={'neck/neck-scale-horiz': 0.5, 'neck/neck-scale-depth': 0.25, 'head/head-scale-vert': 0.35, 'head/head-scale-horiz': 0.2, 'head/head-scale-depth': 0.15,
              'measure/measure-upperarm-length': 0.4,
              'torso/torso-muscle-pectoral': 0.7, 'torso/torso-muscle-dorsi': 0.55, 'torso/torso-vshape': 0.4,
              'armslegs/l-upperarm-muscle': 0.85, 'armslegs/r-upperarm-muscle': 0.85, 'armslegs/l-upperarm-shoulder-muscle': 0.7, 'armslegs/r-upperarm-shoulder-muscle': 0.7,
              'armslegs/l-lowerarm-muscle': 0.6, 'armslegs/r-lowerarm-muscle': 0.6, 'armslegs/l-upperleg-muscle': 0.4, 'armslegs/r-upperleg-muscle': 0.4,
              'armslegs/l-lowerleg-muscle': 0.3, 'armslegs/r-lowerleg-muscle': 0.3},
        skin='young_lightskinned_male_diffuse2', eyes='brownlight', hair='short04', hair_color=(0.05, 0.035, 0.025), scalp=None,
        hair_cards=dict(comb='back', atlas='hair_cards_s.png', length=(0.45, 0.16, 0.2), width=0.09, n=3400, lift=0.055, gravity=0.02, no_face=True, side_lift=0.3, part=-0.15, quiff=0.08,
                        hairline=dict(front=4, temple=2, side=14, back=-42)),
        glasses=None,
        outfit='camilo', depth_scale=0.45, neutral_mouth=True, mouth_from_base=True, shoes=('shoes05', 'redstripes'),
        post_mods={'mouth/mouth-laugh-lines': -0.4},
        mouth_scale=(1.35, 1.3), mouth_feather=0.04, desmile=0.75, delight=1.0, lum=-50, despecular=0.9, flash=0.45, chroma_keep=0.36, brow_boost=0.85, brow_width=1.25,
        body_hair=dict(legs=0.4, arms=0.3), body_hair_color=(30, 24, 20),
        beard=0.08, beard_color=(40, 32, 28), scalp_density=1.0, scalp_color=(20, 16, 14), scalp_shadow=0.8,
    ),
    'rafa': dict(
        display='RAFA', photo='rafa_foto4.jpg', wb=0.62, beard_over_photo=0.45, beard_extent=1.1, brow_boost=0.4,
        # height swapped with Alejandro at the user's request (1.737 m; was 1.673 m)
        body=dict(gender=1, age=0.72, muscle=0.45, weight=0.98, height=0.5039, proportions=0.4, caucasian=1, african=0, asian=0),
        mods={'stomach/stomach-pregnant': 0.45, 'neck/neck-scale-horiz': 0.45, 'neck/neck-double': 0.7, 'head/head-fat': 0.7, 'measure/measure-upperarm-length': 0.72,
              'cheek/l-cheek-volume': 0.5, 'cheek/r-cheek-volume': 0.5},
        skin='middleage_lightskinned_male_diffuse', eyes='brownlight', hair='short01', hair_color=(0.035, 0.032, 0.03), hair_grey=0.035, hair_grey_color=[0.14, 0.138, 0.135], hair_color_auto=False, scalp=None,
        hair_cards=dict(comb='curly', length=(0.42, 0.22, 0.26), width=0.11, n=3800, lift=0.12, gravity=0.0, atlas='hair_cards_curly_s.png', no_face=True,
                        hairline=dict(front=11, temple=7, side=14, back=-42)),
        glasses=dict(style='thick', color=(0.1, 0.07, 0.1), rim=0.0045),
        outfit='rafa', depth_scale=0.45, neutral_mouth=True, mouth_from_base=False, shoes=('shoes06', 'neon'), shoes_nb='freshfoam_lime',
        body_hair=dict(legs=0.7, arms=0.6), body_hair_color=(50, 46, 44),
        beard=0.7, beard_color=(58, 53, 50), scalp_density=1.0, scalp_color=(45, 42, 40), scalp_shadow=0.8, beard_shadow=0.45,
        beard_strand_color=(34, 29, 26), beard_grey=0.3, beard_len=0.0032, beard_layers=7,
    ),
    'dani': dict(
        display='DANI', photo='dani2.jpg', brow_boost=0.5,
        # tanned (the indoor selfie reads grey)
        skin_tint=(3, 8), lum=-4,
        # 60 years old, slim runner, 1.76 m (height tuned by measuring the build)
        body=dict(gender=1, age=0.77, muscle=0.52, weight=0.27, height=0.52, proportions=0.6, caucasian=1, african=0, asian=0),
        mods={'stomach/stomach-pregnant': -0.35, 'measure/measure-upperarm-length': 0.62},
        skin='middleage_lightskinned_male_diffuse', eyes='brownlight', hair=None, hair_color=(0.03, 0.024, 0.02), hair_grey=0.06,
        hair_grey_color=[0.12, 0.115, 0.11], hair_color_auto=False, scalp=None,
        # thick dark wavy curls with volume on top, over the tops of the ears and down to the nape
        # (a ragged fringe and slightly receding temples: an even cut line read as a helmet)
        hair_cards=dict(comb='curly', curl=0.45, length=(0.58, 0.4, 0.5), width=0.11, n=5200, lift=0.15, gravity=0.16,
                        atlas='hair_cards_curly_s.png', no_face=True, side_lift=0.6, face_jitter=0.4,
                        hairline=dict(front=11, temple=9, side=14, back=-46)),
        glasses=None,
        outfit='dani', depth_scale=0.45, neutral_mouth=True, mouth_from_base=True, shoes=('shoes05', 'grey_blue'),
        body_hair=dict(legs=0.6, arms=0.45), body_hair_color=(42, 36, 32),
        scalp_density=1.0, scalp_color=(36, 30, 26), scalp_shadow=0.8,
        # a short full salt-and-pepper beard: dark (almost black) hairs with silver ones on the moustache and cheeks, a
        # whiter chin (the share of grey strands is a map, not one value), over a dark shadow
        # (fuller and darker at the user's request, twice: denser, longer, further down the neck; then "too high, it
        # almost reaches his eyes": the edge on the cheeks stays below the cheekbones and climbs gently to the sideburns)
        # (the shadow under the strands is the beard's own dark mass: with the skin showing through, white strands over
        # it read as frost)
        beard=1.0, beard_extent=1.45, beard_cheek=-0.08, beard_fade=0.1, beard_rise=0.6, beard_color=(60, 55, 52), beard_shadow=1.9, beard_over_photo=0.9, beard_salt=0.2, beard_stroke=(5, 10),
        beard_strand_color=(30, 26, 24), beard_grey_color=(176, 172, 166), beard_grey=0.18, beard_grey_chin=0.6, beard_len=0.009, beard_layers=9,
        lip_lum=-14, lip_chroma=1.7,
    ),
    'zapponi': dict(
        display='ZAPPONI', photo='zapponi_foto1.jpg', brow_boost=0.45,
        body=dict(gender=1, age=0.63, muscle=0.75, weight=0.96, height=0.55, proportions=0.5, caucasian=1, african=0, asian=0),
        mods={'stomach/stomach-pregnant': 0.3, 'neck/neck-scale-horiz': 0.4, 'head/head-scale-vert': 0.2, 'head/head-scale-horiz': 0.08, 'measure/measure-upperarm-length': 0.68},
        skin='middleage_lightskinned_male_diffuse', eyes='brownlight', hair=None, scalp='bald',
        glasses=dict(style='half', color=(0.12, 0.12, 0.13), rim=0.003),
        outfit='zapponi', depth_scale=0.45, neutral_mouth=True, mouth_from_base=True, shoes=('shoes06', 'grey'), shoes_nb='574_grey',
        post_mods={'mouth/mouth-laugh-lines': -0.3},
        mouth_scale=(1.35, 1.3), mouth_feather=0.04, desmile=0.7, delight=0.8, flash=0.5, wb=0.2, lum=-14,
        beard_over_photo=0.35, beard_goatee=0.85, beard_extent=0.7, beard_shadow=0.5, beard_lip_clear=0.22, lip_lum=-8, lip_chroma=1.5,
        body_hair=dict(legs=0.8, arms=0.8), body_hair_color=(35, 30, 28),
        beard=1.0, beard_color=(30, 24, 22), scalp_density=0.25, scalp_color=(60, 52, 48), scalp_shadow=0.15, scalp_rough=0.3,
        beard_strand_color=(34, 28, 26), beard_grey=0.08, beard_len=0.003, beard_layers=7,
    ),
    'noemi': dict(
        display='NOEMÍ', photo='noemi.jpg', brow_boost=0.3, brow_color=(0.07, 0.04, 0.022),
        # 49 years old, 1.68 m (height tuned by measuring the build), soft and curvy
        body=dict(gender=0, age=0.685, muscle=0.4, weight=0.85, height=0.5601, proportions=0.5, caucasian=1, african=0, asian=0),
        mods={'measure/measure-upperarm-length': 0.6, 'stomach/stomach-pregnant': 0.25, 'hip/hip-scale-horiz': 0.15,
              'buttocks/buttocks-volume': 0.15, 'neck/neck-double': 0.35},
        skin='middleage_lightskinned_female_diffuse', eyes='brownlight', hair=None, scalp=None,
        # warm mid brown with golden ends (a share of the strands carries the lighter colour)
        # (measured against noemi.jpg: her hair reads ~30% lighter and more golden than the first build)
        hair_color=(0.24, 0.135, 0.058), hair_grey=0.36, hair_grey_color=[0.5, 0.33, 0.17], hair_color_auto=False,
        # curly bob: parted on her left, swept over the top to her right, down past the ears to about the chin
        hair_cards=dict(comb='bob', part_az=32, sweep=80, spread=1.06, back_spread=0.92, end_dy=0.02, back_dy=0.28, face_clear=56,
                        curl=0.095, pitch=0.46, width=0.16, seg=0.14, atlas='hair_cards_curly_r.png', baby=0,
                        layers=[(1500, 0.86, 0.025, 0.42, 0.12, 0.6), (1700, 1.0, 0.05, 0.62, 0.24, 1.0), (1100, 1.05, 0.075, 0.82, 0.33, 1.3)],
                        crown_layers=[(900, 0.9, 0.04, 0.62, 0.14, 1.1)], top_lift=0.05, front_rise=10, edge_curls=120, edge_fall=0.35, edge_drop=6,
                        # (her forehead is high: the hair's edge sits ~3 cm above the forehead landmark, lower at her
                        # right temple where the swept hair comes down; a card hangs half its width below its root)
                        hairline=dict(front=28, temple=22, tilt=-4, side=16, back=-40)),
        hairline=dict(front=20, temple=15, side=14, back=-40),
        glasses=None,
        outfit='noemi', depth_scale=0.45, neutral_mouth=True, mouth_from_base=False, desmile=0.3, shoes=('shoes05', 'grey_white'),
        scalp_density=1.0, scalp_color=(100, 74, 50), scalp_shadow=0.85,
    ),
}
