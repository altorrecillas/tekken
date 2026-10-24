"""Build a complete fighter: body shape, fitted photo head, proxies, clothes; export for three.js."""
import sys, os, json
import numpy as np
import cv2
import mhlib as M
import raster as R
from common import *
from facefit import *
from people import PEOPLE

GAME = os.environ.get('GAME_DIR', os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))  # override for experiments
UNIT = 0.1  # MakeHuman decimetres -> metres

SKIN_POLYS = [
    [67, 109, 10, 338, 297, 299, 337, 151, 108, 69],  # forehead
    [116, 117, 118, 119, 100, 142, 203, 206, 207, 187, 147, 123],  # left cheek
    [345, 346, 347, 348, 329, 371, 423, 426, 427, 411, 376, 352],  # right cheek
]


class Exporter:
    def __init__(self):
        self.parts = []
        self.blobs = []
        self.off = 0

    def add_array(self, a):
        b = a.tobytes()
        pad = (-len(b)) % 4
        o = self.off
        self.blobs.append(b + b'\0' * pad)
        self.off += len(b) + pad
        return [o, int(a.size)]

    def add_part(self, name, pos, nrm, uv, sidx, swt, index, mat, color=None, tangent=None):
        extra = {}
        if color is not None:
            extra['color'] = self.add_array(np.asarray(color, np.float32))
        if tangent is not None:
            extra['tangent'] = self.add_array(np.asarray(tangent, np.float32))
        self.parts.append(dict(
            name=name, mat=mat, vcount=len(pos), **extra,
            position=self.add_array(pos.astype(np.float32)),
            normal=self.add_array(nrm.astype(np.float32)),
            uv=self.add_array(uv.astype(np.float32)),
            skinIndex=self.add_array(sidx.astype(np.uint16)),
            skinWeight=self.add_array(swt.astype(np.float32)),
            index=self.add_array(index.astype(np.uint32)),
        ))

    def write(self, path_json, path_bin, extra):
        with open(path_bin, 'wb') as f:
            for b in self.blobs:
                f.write(b)
        json.dump(dict(parts=self.parts, **extra), open(path_json, 'w'))


def to_m(V, ground):
    out = V.copy() * UNIT
    out[:, 1] -= ground * UNIT
    return out


def split_verts(tris, tuv):
    """Unique (v, uv) pairs -> new vertex list."""
    key = tris.astype(np.int64) * 100000 + tuv.astype(np.int64)
    uk, inv = np.unique(key.ravel(), return_inverse=True)
    vi = uk // 100000
    ui = uk % 100000
    return vi, ui, inv.reshape(tris.shape)


def build_head_textures(pid, P, Vg, Vtex, tris, tuv, VT, head_tris, head_vidx, P2, sRt, outdir):
    from headtex import texel_geometry, dilate_fill, HeadFrame, hairline_mask, beard_mask, stubble, fbm, normal_from_height
    skin = cv2.imread(os.path.join(M.MHA, 'skins/textures', P['skin'] + '.png'))
    TH, TW = skin.shape[:2]
    x0, x1 = int(HEAD_U0 * TW), int(HEAD_U1 * TW)
    y0, y1 = int((1 - HEAD_V1) * TH), int((1 - HEAD_V0) * TH)
    base_head = cv2.resize(skin[y0:y1, x0:x1], (HTW, HTH), interpolation=cv2.INTER_CUBIC)

    photo = cv2.imread(os.path.join(TOOLS, 'photos', P['photo']))
    if P.get('despecular', 0) > 0:
        # flash / sun hotspots: compress luminance that sticks out above the local average (chroma kept)
        lab_s = cv2.cvtColor(photo, cv2.COLOR_BGR2LAB).astype(np.float32)
        Ls = lab_s[..., 0]
        sig_s = max(photo.shape[:2]) / 70.0
        low_s = cv2.GaussianBlur(Ls, (0, 0), sig_s)
        dif_s = Ls - low_s
        sd_s = np.sqrt(cv2.GaussianBlur(dif_s ** 2, (0, 0), sig_s)) + 1.0
        chroma_s = np.hypot(lab_s[..., 1] - 128, lab_s[..., 2] - 128)
        excess = np.maximum(0.0, dif_s - 1.2 * sd_s) * (Ls > 140) * np.clip((30 - chroma_s) / 12, 0, 1)
        excess = cv2.GaussianBlur(excess, (0, 0), 2.0)
        lab_s[..., 0] = Ls - excess * P['despecular']
        photo = cv2.cvtColor(np.clip(lab_s, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
        print('  despecular: %.1f%% of pixels touched' % (100 * (excess > 1).mean()))
    segp = os.path.join(TOOLS, 'seg_' + P['photo'].replace('.jpg', '.npy'))
    seg = np.load(segp) if os.path.exists(segp) else None
    if P.get('glasses'):
        photo_orig = photo.copy()
        photo, gm = remove_glasses(photo_orig, P2, debug=os.path.join(OUT, f'{pid}_glasses.jpg'))
        if seg is not None:
            eye_w = np.linalg.norm(P2[33] - P2[133])
            acc = (seg[5] > 90).astype(np.uint8)
            # only dark, frame-like accessory pixels (the segmenter also marks the lens glass)
            gray = cv2.cvtColor(photo_orig, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32)
            k = max(5, int(eye_w * 0.3)) | 1
            bh = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
            acc = acc & (bh > 8)
            excl = np.zeros_like(acc)
            from facefit import L_EYE, R_EYE, L_BROW, R_BROW
            for ids_, grow in ((L_EYE, 1.25), (R_EYE, 1.25), (L_BROW, 1.05), (R_BROW, 1.05)):
                pts = P2[ids_]; cc = pts.mean(0)
                cv2.fillPoly(excl, [np.round(cc + (pts - cc) * grow).astype(np.int32)], 1)
            acc[excl > 0] = 0
            acc = cv2.dilate(acc * 255, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(eye_w * 0.06) | 1,) * 2))
            mask = np.maximum(gm, acc)
            mask[excl > 0] = 0
            photo = cv2.inpaint(photo_orig, mask, max(3, int(eye_w * 0.08)), cv2.INPAINT_TELEA)
            dbg = photo_orig.copy(); dbg[mask > 0] = (0, 0, 255); cv2.imwrite(os.path.join(OUT, f'{pid}_glasses.jpg'), dbg)
            # lens area (inside the frames): equalise low-frequency luminance/chroma with the surrounding skin
            closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(eye_w * 0.6) | 1,) * 2))
            ff = closed.copy(); hh, ww = ff.shape
            flood = np.zeros((hh + 2, ww + 2), np.uint8)
            cv2.floodFill(ff, flood, (0, 0), 255)
            lens = cv2.bitwise_not(ff) | closed
            lens = cv2.erode(lens, np.ones((3, 3), np.uint8))
            if lens.sum() > 0 and P.get('lens_fix', True):
                lf = cv2.GaussianBlur(lens.astype(np.float32) / 255, (0, 0), eye_w * 0.08)
                labp = cv2.cvtColor(photo, cv2.COLOR_BGR2LAB).astype(np.float32)
                ring = (cv2.dilate(lens, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(eye_w * 0.5) | 1,) * 2)) > 0) & (lens == 0)
                sig = eye_w * 0.35
                def nlow(ch, m):
                    num = cv2.GaussianBlur(ch * m, (0, 0), sig); den = cv2.GaussianBlur(m.astype(np.float32), (0, 0), sig) + 1e-4
                    return num / den
                inside = (lens > 0).astype(np.float32); outside = ring.astype(np.float32)
                for ch in range(3):
                    li = nlow(labp[..., ch], inside); lo = nlow(labp[..., ch], outside)
                    labp[..., ch] = labp[..., ch] + (lo - li) * lf * (1.0 if ch else 0.85)
                photo = cv2.cvtColor(np.clip(labp, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
                dbg2 = photo.copy(); dbg2[(lens > 0) & (mask == 0)] = dbg2[(lens > 0) & (mask == 0)] // 2 + np.uint8([0, 60, 0])
                cv2.imwrite(os.path.join(OUT, f'{pid}_lens.jpg'), dbg2)
            dbg = photo_orig.copy(); dbg[mask > 0] = (0, 0, 255); cv2.imwrite(os.path.join(OUT, f'{pid}_glasses.jpg'), dbg)
    if seg is not None and P.get('hair'):
        hairpx = photo[seg[1] > 200]
        if len(hairpx) > 200:
            lab = cv2.cvtColor(hairpx.reshape(-1, 1, 3), cv2.COLOR_BGR2LAB).reshape(-1, 3)
            med = np.median(lab, 0)
            rgb = cv2.cvtColor(np.uint8([[med]]), cv2.COLOR_LAB2RGB)[0, 0] / 255.0
            lin = np.power(rgb, 2.2)
            print('  hair colour (photo median, linear):', lin.round(3))
            if P.get('hair_color_auto', True):
                # limit saturation (photos often have colour casts on dark hair)
                lum = float(lin @ np.array([0.2126, 0.7152, 0.0722]))
                neutral = lum * np.array([1.35, 0.95, 0.72])
                lin = lin * 0.45 + neutral * 0.55
                P['hair_color'] = tuple(lin.tolist())
                print('  hair colour used:', np.round(lin, 3))
    from facecam import bake_head_cam
    photo_tex, wt, covered, skin_mask, extra_ = bake_head_cam(Vtex, tris, tuv, VT, head_tris, photo, sRt, skin_sample_ids=SKIN_POLYS, seg=seg,
                                                             mouth_from_base=P.get('mouth_from_base', False),
                                                             mouth_scale=P.get('mouth_scale', (1.18, 1.45)), mouth_feather=P.get('mouth_feather', 0.02),
                                                             flash=P.get('flash', 0.0))
    mouth_tex = extra_[3]
    # the person's lip colour (outer lip ring minus inner lips) for tinting the base lips
    from facefit import LIPS_OUT, LIPS_IN
    lip_ring = poly_mask(photo.shape, P2[LIPS_OUT]) * (1 - poly_mask(photo.shape, P2[LIPS_IN]))
    lip_px = photo[lip_ring > 0.5]
    lip_lab = cv2.cvtColor(lip_px.reshape(-1, 1, 3), cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32).mean(0) if len(lip_px) > 20 else None
    pos, nrm, valid = texel_geometry(Vg, tris, tuv, head_tris, VT)
    frame = HeadFrame(Vg, head_vidx)

    # --- colour: target skin tone = photo luminance, white balance pulled towards a healthy base
    m = skin_mask > 0.5
    ph_lab = cv2.cvtColor(np.clip(photo_tex, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    bs_lab = cv2.cvtColor(base_head, cv2.COLOR_BGR2LAB).astype(np.float32)
    st_ph = (ph_lab[m].mean(0), ph_lab[m].std(0))
    st_bs = (bs_lab[m].mean(0), bs_lab[m].std(0))
    wb = P.get('wb', 0.45)
    tgt_mean = st_ph[0].copy()
    tgt_mean[1:] = st_ph[0][1:] * (1 - wb) + st_bs[0][1:] * wb
    tgt_mean[0] = st_ph[0][0] * 0.85 + st_bs[0][0] * 0.15 + P.get('lum', 0)
    # optional Lab (a, b) shift: a tan the photo's light does not show (a grey indoor selfie)
    tgt_mean[1:] += np.array(P.get('skin_tint', (0, 0)), np.float32)
    tgt = (tgt_mean, st_ph[1])
    print('  skin lab photo', st_ph[0].round(1), 'base', st_bs[0].round(1), 'target', tgt_mean.round(1))
    ph_shift = ph_lab + (tgt_mean - st_ph[0])
    photo_c = cv2.cvtColor(np.clip(ph_shift, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)
    base_m = color_transfer(base_head, st_bs, tgt).astype(np.float32)
    skin_body = color_transfer(skin, st_bs, tgt)

    # --- clean scalp: replace painted hair of the base texture with plain skin + pores
    fl = frame.el_of(10)
    hp = P.get('hairline', {})
    scalp = hairline_mask(frame, pos, valid, front_el=fl + hp.get('front', 6), temple_el=fl + hp.get('temple', 4),
                          side_el=hp.get('side', 16), back_el=hp.get('back', -40))
    cap = hairline_mask(frame, pos, valid, front_el=fl + 2, temple_el=fl, side_el=14, back_el=-44, soft=5)
    skin_col = cv2.cvtColor(np.uint8([[tgt_mean]]), cv2.COLOR_LAB2BGR)[0, 0].astype(np.float32)
    noise = fbm((HTH, HTW), (64, 16, 4), 5)[..., None]
    base_hp = base_m - cv2.GaussianBlur(base_m, (0, 0), 3)  # keep only fine grain
    grain = np.clip(base_hp, -12, 12) * 0.35
    clean = skin_col[None, None] * (1.0 + noise * 0.035) + grain
    clean = clean * np.array([0.98, 0.99, 1.04])  # scalp slightly pinker
    capm = cv2.GaussianBlur(cap.astype(np.float32), (0, 0), 6)[..., None]
    base_m = base_m * (1 - capm) + clean * capm

    if P.get('mouth_from_base') and lip_lab is not None:
        mt = cv2.GaussianBlur(mouth_tex, (0, 0), 6)
        bl = cv2.cvtColor(np.clip(base_m, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
        # base lips are the redder texels inside the mouth area
        redness = np.clip((bl[..., 1] - bl[..., 1][mt > 0.5].mean()) / 8 + 0.5, 0, 1) * (mt > 0.05)
        sel = mt > 0.05
        tgt_lip = lip_lab.copy(); tgt_lip[0] = tgt_lip[0] * 0.9 + P.get('lip_lum', 12)
        # stretched lips in a broad smile sample pale: optionally push the chroma back out
        tgt_lip[1:] = 128 + (tgt_lip[1:] - 128) * P.get('lip_chroma', 1.0)
        for ch in range(3):
            bl[..., ch] = bl[..., ch] + (tgt_lip[ch] - bl[..., ch][redness > 0.6].mean() if (redness > 0.6).any() else 0) * redness * mt
        base_m = cv2.cvtColor(np.clip(bl, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)
    # --- de-light photo (equalise low frequency luminance to the base)
    wmask = (wt > 0.02).astype(np.float32) * wt
    sig = 28

    def lowpass(img, w):
        num = cv2.GaussianBlur(img * w, (0, 0), sig)
        den = cv2.GaussianBlur(w, (0, 0), sig) + 1e-4
        return num / den
    Lp = cv2.cvtColor(np.clip(photo_c, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32)
    Lb = cv2.cvtColor(np.clip(base_m, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32)
    ratio = np.clip((lowpass(Lb, wmask) + 5) / (lowpass(Lp, wmask) + 5), 0.6, 1.7) ** P.get('delight', 0.65)
    if P.get('beard', 0) > 0:
        # de-lighting must not wash out the beard's darkness (it would read as a pale powdery patch)
        bm_pre = beard_mask(frame, pos, valid, extent=P.get('beard_extent', 1.0), goatee=P.get('beard_goatee', 0.0), lip_clear=P.get('beard_lip_clear', 0.34), cheek=P.get('beard_cheek', 0.0), fade=P.get('beard_fade', 0.08), rise=P.get('beard_rise', 1.0)) * P['beard']
        ratio = np.where(ratio > 1, ratio ** (1 - 0.8 * np.clip(bm_pre, 0, 1)), ratio)
    photo_adj = np.clip(photo_c * ratio[..., None], 0, 255)
    # chroma: take low frequencies from the (colour matched) base -> removes lens tints / colour casts
    la = cv2.cvtColor(photo_adj.astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    lb_ = cv2.cvtColor(np.clip(base_m, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    csig = P.get('chroma_sigma', 10)
    for ch in (1, 2):
        lowp = lowpass(la[..., ch], wmask) if False else cv2.GaussianBlur(la[..., ch], (0, 0), csig)
        lowb = cv2.GaussianBlur(lb_[..., ch], (0, 0), csig)
        keep = P.get('chroma_keep', 0.35)
        la[..., ch] = la[..., ch] - lowp * (1 - keep) + (lowb * 0.5 + lowp * 0.5) * (1 - keep)
    # chroma clamp: skin can only take chroma close to the person's own skin distribution (kills lens tints,
    # bruise-like purple reflections and chroma noise from dim photos); lips keep their colour
    m_sk = (skin_mask > 0.5) & (wt > 0.5)
    if m_sk.sum() > 200 and P.get('chroma_clamp', 1.6) > 0:
        ab = la[..., 1:3].reshape(-1, 2)
        mu = ab[m_sk.ravel()].mean(0); cov = np.cov(ab[m_sk.ravel()].T) + np.eye(2) * 1.0
        ci = np.linalg.inv(cov)
        dv = ab - mu
        d = np.sqrt(np.einsum('ni,ij,nj->n', dv, ci, dv)).reshape(la.shape[:2])
        k = P.get('chroma_clamp', 1.6)
        # beyond k sigma the chroma fades back to the skin mean (off-hue pixels become plain skin)
        sc = np.where(d > k, k / np.maximum(d, 1e-6) * np.exp(-(d - k) / k), 1.0)
        lipk = np.clip(cv2.GaussianBlur(mouth_tex, (0, 0), 4) * 1.5, 0, 1)
        sc = sc * (1 - lipk) + lipk
        la[..., 1] = mu[0] + (la[..., 1] - mu[0]) * sc
        la[..., 2] = mu[1] + (la[..., 2] - mu[1]) * sc
        print('  chroma clamp: %.1f%% of texels pulled in' % (100 * (d[wt > 0.5] > k).mean()))
    photo_adj = cv2.cvtColor(np.clip(la, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)

    bm = cv2.erode(wt, np.ones((9, 9), np.uint8))
    bm = cv2.GaussianBlur(bm, (0, 0), 10)
    bm = np.clip(bm * 1.15, 0, 1)
    head = pyr_blend(photo_adj, base_m, bm, levels=5)

    # --- facial hair / scalp hair outside the photo
    lab_img = cv2.cvtColor(np.clip(photo_c, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB)
    beard_col = np.array(P.get('beard_color', (60, 55, 52)), np.float32)[::-1]  # given RGB -> BGR
    hair_col = np.array(P.get('scalp_color', (40, 36, 34)), np.float32)[::-1]
    rough = np.full((HTH, HTW), 0.5, np.float32)
    bd = P.get('beard', 0.0)
    beard_out = None
    if bd > 0:
        bmask = beard_mask(frame, pos, valid, extent=P.get('beard_extent', 1.0), goatee=P.get('beard_goatee', 0.0), lip_clear=P.get('beard_lip_clear', 0.34), cheek=P.get('beard_cheek', 0.0), fade=P.get('beard_fade', 0.08), rise=P.get('beard_rise', 1.0))
        dens = bmask * bd * (1 - bm * 0.85 * (1 - P.get('beard_over_photo', 0.0)))
        shells = P.get('beard_shells', bd >= 0.3)
        # with 3D shells on top the painted layer only carries the roots / skin shadow
        cov = stubble((HTH, HTW), dens * (0.22 if shells else 0.55), seed=3, length=(2.5, 5), count_scale=1.0)
        cov = np.clip(cov * (0.45 if shells else 0.9) + cv2.GaussianBlur(dens, (0, 0), 2) * 0.35 * P.get('beard_shadow', 1.0), 0, 1)
        head = head * (1 - cov[..., None]) + beard_col * cov[..., None]
        # the share of grey hairs over the face: one value, or whiter on the chin (the goatee patch below the lower
        # lip) and salt-and-pepper on the moustache and cheeks
        gmap = None
        g = P.get('beard_grey', 0.5)
        gchin = P.get('beard_grey_chin')
        if gchin is not None:
            lm = frame.lm
            ym = (lm[13][1] + lm[14][1]) / 2
            below = np.clip((ym - pos[..., 1]) / max(ym - lm[152][1], 1e-3), 0, 1)
            cx, half = (lm[61][0] + lm[291][0]) / 2, abs(lm[291][0] - lm[61][0]) / 2
            mid = np.exp(-((pos[..., 0] - cx) / (half * 1.6)) ** 2)
            g = gmap = (g + (gchin - g) * np.clip(below * 1.6, 0, 1) * mid).astype(np.float32)
        salt = P.get('beard_salt', 0.0)
        if salt > 0:
            # salt-and-pepper stubble of several days: longer white and dark hairs painted over the shadow (the fur
            # shells alone read as an even grey veil at game distance)
            dcol = np.array(P.get('beard_strand_color', (52, 46, 42)), np.float32)[::-1]
            wcol = np.array(P.get('beard_grey_color', (210, 206, 200)), np.float32)[::-1]
            sl = P.get('beard_stroke', (4, 8))
            dk = stubble((HTH, HTW), dens * salt * (1 - g), seed=5, length=sl) * 0.75
            wh = stubble((HTH, HTW), dens * salt * g, seed=9, length=sl) * 0.8
            head = head * (1 - dk[..., None]) + dcol * dk[..., None]
            head = head * (1 - wh[..., None]) + wcol * wh[..., None]
        rough = np.maximum(rough, bmask * bd * 0.75)
        if shells:
            # density map for the fur-shell beard + texel size in metres (strand tiling)
            dmap = dilate_fill(cv2.GaussianBlur(np.clip(bmask * bd, 0, 1).astype(np.float32), (0, 0), 1.5), valid, 16)
            d8 = np.clip(dmap * 255, 0, 255).astype(np.uint8)
            if gmap is not None:
                # the shells' share of grey strands per texel in the green channel (the density stays in red)
                g8 = np.clip(dilate_fill(cv2.GaussianBlur(gmap, (0, 0), 3), valid, 16) * 255, 0, 255).astype(np.uint8)
                d8 = np.stack([d8, g8, d8], -1)
            cv2.imwrite(os.path.join(outdir, 'beard_d.png'), d8)
            vb = valid & (bmask > 0.2)
            du = np.linalg.norm(pos[:, 1:] - pos[:, :-1], axis=2); dv = np.linalg.norm(pos[1:] - pos[:-1], axis=2)
            tu = float(np.median(du[vb[:, 1:] & vb[:, :-1]])) * UNIT
            tv = float(np.median(dv[vb[1:] & vb[:-1]])) * UNIT
            beard_out = dict(dens=dmap, texel=(tu, tv), grey_map=gmap is not None)
            print('  beard shells: texel %.2f x %.2f mm' % (tu * 1000, tv * 1000))
    sd = P.get('scalp_density', 0.0)
    if sd > 0:
        dens = scalp * sd
        cov = stubble((HTH, HTW), dens * 0.8, seed=4, length=(1.5, 3.5), count_scale=1.0)
        cov = np.clip(cov * 0.85 + cv2.GaussianBlur(dens, (0, 0), 1.5) * P.get('scalp_shadow', 0.45), 0, 1)
        # keep photo where it is reliable (forehead hairline in photo)
        cov *= (1 - bm * P.get('scalp_photo_keep', 0.7))
        head = head * (1 - cov[..., None]) + hair_col * cov[..., None]
    rough = np.where(cap > 0.5, P.get('scalp_rough', 0.42), rough)
    bb = P.get('brow_boost', 0.0)
    if bb > 0:
        # eyebrows: after de-lighting the projected brows read thin and pale. Deepen them inside a band built from
        # the 3D brow landmarks (centre line between the upper and lower edge, tapered towards the tail), keeping
        # the photo's own hair pattern (darker texels darken more)
        from facefit import L_BROW, R_BROW
        bmk = np.zeros((HTH, HTW), np.float32)
        P3 = pos.reshape(-1, 3)
        for ids in (L_BROW, R_BROW):
            up = np.array([frame.lm[i] for i in ids[:5]])
            lo = np.array([frame.lm[i] for i in ids[5:]])[::-1]
            ctr = (up + lo) / 2
            half = np.linalg.norm(up - lo, axis=1) / 2 * P.get('brow_width', 1.15)
            half *= np.array([0.7, 0.9, 1.0, 1.0, 0.95])  # thinner tail (outer end first)
            lo_b, hi_b = ctr.min(0) - 0.3, ctr.max(0) + 0.3
            sel = np.all((P3 >= lo_b) & (P3 <= hi_b), axis=1) & valid.ravel()
            q = P3[sel]
            best = np.full(len(q), 1e9); bt = np.zeros(len(q))
            for k in range(4):
                a, b = ctr[k], ctr[k + 1]
                ab = b - a; t = np.clip(((q - a) @ ab) / (ab @ ab), 0, 1)
                d = np.linalg.norm(q - (a + t[:, None] * ab), axis=1)
                w = half[k] + (half[k + 1] - half[k]) * t
                r = d / w
                better = r < best
                best = np.where(better, r, best); bt = np.where(better, k + t, bt)
            m = smoothstep(1.25, 0.75, best)
            # fade in at the inner end (brows start softly above the nose)
            m *= smoothstep(4.0, 3.4, bt) * 0.4 + 0.6
            flat = bmk.ravel(); flat[np.where(sel)[0]] = np.maximum(flat[np.where(sel)[0]], m)
            bmk = flat.reshape(HTH, HTW)
        bmk = cv2.GaussianBlur(bmk, (0, 0), 1.2) * np.clip(1 + fbm(bmk.shape, (24, 6), 7) * 0.4, 0, 1.3)
        Lh = cv2.cvtColor(np.clip(head, 0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
        ref = cv2.GaussianBlur(Lh, (0, 0), 12)
        hairy = np.clip((ref - Lh) / 22.0, 0, 1)
        lin = np.array(P.get('brow_color', P.get('hair_color', (0.04, 0.03, 0.025))), np.float32)
        bcol = (np.power(np.clip(lin, 0, 1), 1 / 2.2) * 255)[::-1]  # linear RGB -> sRGB BGR
        amt = np.clip(bb * bmk * (0.35 + 0.65 * hairy), 0, 0.92)[..., None]
        head = head * (1 - amt) + bcol * amt
        print('  brows: boost %.2f over %d texels' % (bb, int((bmk > 0.3).sum())))
    # oily T-zone
    el, az = frame.angles(pos)
    tz = smoothstep(18, 4, np.abs(az)) * smoothstep(-25, -5, el) * smoothstep(40, 20, el)
    rough = rough * (1 - tz * 0.28)
    head = np.clip(head, 0, 255)
    # (the whole background filled from the islands: uvpad.py)
    from uvpad import pushpull_fill
    head = pushpull_fill(head.astype(np.float32), valid)
    rough = pushpull_fill(rough.astype(np.float32), valid)
    # pore / detail normal map from high-pass luminance
    L = cv2.cvtColor(head.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    hp_ = L - cv2.GaussianBlur(L, (0, 0), 2.5)
    nmap = normal_from_height(hp_, strength=4.0)
    cv2.imwrite(os.path.join(outdir, 'head.jpg'), head.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
    cv2.imwrite(os.path.join(outdir, 'head_n.jpg'), nmap, [cv2.IMWRITE_JPEG_QUALITY, 90])
    cv2.imwrite(os.path.join(outdir, 'head_r.jpg'), np.clip(rough * 255, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 90])
    cv2.imwrite(os.path.join(OUT, f'{pid}_head_rot.jpg'), cv2.rotate(cv2.resize(head.astype(np.uint8), (512, 1024)), cv2.ROTATE_90_CLOCKWISE))
    return dict(skin_lab=tgt_mean.tolist(), tgt=tgt, skin_raw=skin, beard=beard_out)


def fix_neck_seam(outdir, tris, tuv, VT, head_tris, Vg, head_vidx, sigma=26, reach=110):
    """Match the head texture to the body texture along the head/neck UV seam with a smooth correction field."""
    from facefit import head_uv
    hp = os.path.join(outdir, 'head.jpg'); bp = os.path.join(outdir, 'skin.jpg')
    head = cv2.imread(hp).astype(np.float32); body = cv2.imread(bp).astype(np.float32)
    Hh, Hw = head.shape[:2]; Bh, Bw = body.shape[:2]
    is_head = np.zeros(len(tris), bool); is_head[head_tris] = True
    hv, hu = tris[is_head].ravel(), tuv[is_head].ravel()
    bv, bu = tris[~is_head].ravel(), tuv[~is_head].ravel()
    seam = np.intersect1d(np.unique(hv), np.unique(bv))
    # only the neck boundary: the island also borders the eye sockets and the mouth cavity, which must not
    # pull the eyelids / lips towards the socket colours
    from headtex import HeadFrame
    lm = HeadFrame(Vg, head_vidx).lm
    d_eye = np.min([np.linalg.norm(Vg[seam] - lm[i], axis=1) for i in (33, 133, 263, 362)], 0)
    d_mouth = np.min([np.linalg.norm(Vg[seam] - lm[i], axis=1) for i in (13, 14, 61, 291)], 0)
    seam = seam[(d_eye > 0.45) & (d_mouth > 0.45)]  # what is left is the jaw-line / behind-the-ear seam
    if len(seam) == 0:
        return
    hmap = dict(zip(hv.tolist(), hu.tolist())); bmap = dict(zip(bv.tolist(), bu.tolist()))
    huv = head_uv(VT[[hmap[v] for v in seam]]); buv = VT[[bmap[v] for v in seam]]
    hx = np.stack([huv[:, 0] * Hw, (1 - huv[:, 1]) * Hh], 1); bx = np.stack([buv[:, 0] * Bw, (1 - buv[:, 1]) * Bh], 1)
    Hb = cv2.GaussianBlur(head, (0, 0), 5); Bb = cv2.GaussianBlur(body, (0, 0), 5 * Bw / Hw + 1)
    hs = Hb[np.clip(hx[:, 1].astype(int), 0, Hh - 1), np.clip(hx[:, 0].astype(int), 0, Hw - 1)]
    bs = Bb[np.clip(bx[:, 1].astype(int), 0, Bh - 1), np.clip(bx[:, 0].astype(int), 0, Bw - 1)]
    diff = bs - hs
    D = np.zeros((Hh, Hw, 3), np.float32); W = np.zeros((Hh, Hw), np.float32); mask = np.zeros((Hh, Hw), np.uint8)
    for (x, y), d in zip(hx.astype(int), diff):
        cv2.circle(D, (int(x), int(y)), 3, d.tolist(), -1); cv2.circle(W, (int(x), int(y)), 3, 1.0, -1); cv2.circle(mask, (int(x), int(y)), 3, 255, -1)
    Ds = cv2.GaussianBlur(D, (0, 0), sigma); Ws = cv2.GaussianBlur(W, (0, 0), sigma)
    field = Ds / np.maximum(Ws, 1e-4)[..., None]
    dist = cv2.distanceTransform(255 - mask, cv2.DIST_L2, 5)
    fall = np.exp(-(dist / reach) ** 2)[..., None]
    out = np.clip(head + field * fall, 0, 255)
    cv2.imwrite(hp, out.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
    print('  neck seam: %d verts, mean |diff| %.1f' % (len(seam), np.abs(diff).mean()))


def shoe_tex(shoe, outdir):
    name, recolor = shoe
    img = cv2.imread(os.path.join(M.MHA, f'clothes/{name}/{name}_diffuse.png'))
    if recolor:
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
        if recolor == 'black':
            img = (img.astype(np.float32) * 0.22 + 8).clip(0, 255).astype(np.uint8)
        elif recolor == 'neon':
            bright = (hsv[..., 2] > 150) & (hsv[..., 1] < 90)
            hsv[..., 0] = np.where(bright, 38, hsv[..., 0]); hsv[..., 1] = np.where(bright, 200, hsv[..., 1])
            img = cv2.cvtColor(hsv.clip(0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)
        elif recolor == 'redstripes':
            dark = hsv[..., 2] < 80
            img[dark] = (40, 30, 200)
        elif recolor == 'grey_white':
            sat = hsv[..., 1] > 60
            g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            img[sat] = cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)[sat]
        elif recolor == 'grey_blue':
            # grey / white runner with royal-blue accents
            sat = hsv[..., 1] > 60
            g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            img[~sat] = cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)[~sat]
            hsv[..., 0] = np.where(sat, 108, hsv[..., 0]); hsv[..., 1] = np.where(sat, 190, hsv[..., 1])
            img[sat] = cv2.cvtColor(hsv.clip(0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)[sat]
        elif recolor == 'grey':
            g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            img = cv2.cvtColor((g * 0.55 + 20).astype(np.uint8), cv2.COLOR_GRAY2BGR)
    cv2.imwrite(os.path.join(outdir, 'shoes.jpg'), img, [cv2.IMWRITE_JPEG_QUALITY, 90])


def build(pid, quick=False):
    P = PEOPLE[pid]
    print('==', pid)
    outdir = os.path.join(GAME, 'assets/chars', pid)
    os.makedirs(outdir, exist_ok=True)
    B = M.base()
    VT = B['vt']
    tris, tuv, fid = body_tris()
    lab = uv_islands()

    # ---- body shape
    tg = M.macro_weights(P['body']) + M.modifier_targets(P.get('mods', {}))
    V = M.apply_targets(B['v'], tg)

    # ---- face geometry: perspective-camera morphable-model fit + RBF residuals
    from facecam import fit_face
    V, ftg, disp_geo, disp_full, cam = fit_face(V, P['photo'], lam=P.get('fit_lam', 0.0025), neutral=P.get('neutral_mouth', True), desmile=P.get('desmile', 0.0))
    P2 = cam.P2
    Vg = V + disp_geo
    Vtex = V + disp_full
    Vg = close_lids(Vg, P.get('lid_upper', 9.0), P.get('lid_lower', 3.0))
    pm = P.get('post_mods', {})
    if pm:
        Vg = M.apply_targets(Vg, M.modifier_targets(pm))
    sRt = cam

    # ---- islands: head texture triangles
    idx_lm, _ = mh_landmarks(V)
    c = corr()['corr'][4]
    head_label = lab[tuv[np.where((tris == c['v'][0]).any(1))[0][0]][0]]
    tri_lab = lab[tuv[:, 0]]
    head_tris = np.where(tri_lab == head_label)[0]
    print('  head tris', len(head_tris))

    # ---- textures
    head_vidx = np.unique(tris[head_tris])
    tex = build_head_textures(pid, P, Vg, Vtex, tris, tuv, VT, head_tris, head_vidx, P2, sRt, outdir)

    # ---- skeleton & weights
    bones = M.skeleton(Vg)
    bnames = [b['name'] for b in bones]
    Wfull = M.weights(len(Vg), bnames)
    ground = Vg[:13380, 1].min()

    ex = Exporter()
    # ---- garments
    from garments import BodyCtx, make_shell, fabric_maps
    from outfits import OUTFITS
    ctx = BodyCtx(Vg, tris, tuv, VT, Wfull, bones)
    hidden = np.zeros(len(tris), bool)
    from bodytex import build_body_skin
    build_body_skin(ctx, P, tex['skin_raw'], None, tex['tgt'], outdir)
    fix_neck_seam(outdir, tris, tuv, VT, head_tris, Vg, head_vidx)
    outfit = OUTFITS[P['outfit']](ctx, P)
    from outfits import Gear
    gears = [g for g in outfit if isinstance(g, Gear)]
    outfit = [g for g in outfit if not isinstance(g, Gear)]
    if gears:
        from garments import SurfaceSnap
        snapper = SurfaceSnap(ctx)
        for gear in gears:
            groups = {}
            for mname, (gv, guv, gt, gw) in gear.build(ctx, snapper, Wfull):
                if len(gt) == 0:
                    continue
                G_ = groups.setdefault(mname, [[], [], [], [], 0])
                G_[0].append(gv); G_[1].append(guv); G_[2].append(gt + G_[4]); G_[3].append(gw); G_[4] += len(gv)
            for mname, (vl, ul, tl, wl, _) in groups.items():
                gv = np.concatenate(vl); guv = np.concatenate(ul); gt = np.concatenate(tl); gw = np.concatenate(wl)
                gsi, gsw = M.top4(gw)
                mat = dict(gear.mat)
                if mname.endswith('refl'):
                    mat = dict(type='cloth', color=[0.55, 0.56, 0.58], roughness=0.3, sheen=0.1)
                ex.add_part(f'{gear.name}_{mname}', to_m(gv, ground), R.vertex_normals(gv, gt), guv, gsi, gsw, gt.ravel(), mat)
                print(f'  gear {mname}: {len(gv)} verts')
    # layering: where a top overlaps the waistband of shorts/trousers, the lower garment stays under the top
    tops = [g for g in outfit if g.name in ('shirt', 'jacket', 'polo', 'top')]
    for g in outfit:
        if g.name in ('shorts', 'pants') and tops:
            t = tops[0]
            toff = np.broadcast_to(np.asarray(t.offset, float), (ctx.n,)) if np.ndim(t.offset) == 0 else np.asarray(t.offset[:ctx.n], float)
            goff = np.array(np.broadcast_to(np.asarray(g.offset, float), (ctx.n,)) if np.ndim(g.offset) == 0 else g.offset[:ctx.n], float)
            both = np.asarray(t.covered[:ctx.n], bool) & np.asarray(g.covered[:ctx.n], bool)
            goff[both] = np.minimum(goff[both], np.maximum(toff[both] * 0.55, 0.004))
            g.offset = goff
    top_layer = None  # (per body vertex weights, coverage) of the top: the lower garment follows it underneath
    for g in outfit:
        # (tops: the neckline lies on the base of the neck, see make_shell's neck_snug; an outfit can set its own)
        snug = getattr(g, 'neck_snug', None) or (dict(frac=0.35, band=0.7) if g.name in ('shirt', 'jacket', 'polo', 'top') else None)
        sh = make_shell(ctx, g.covered, g.offset, hem_depth=g.hem_depth, name=g.name, snap=g.snap,
                        relax=getattr(g, 'relax', 20 if g.name in ('shirt', 'jacket') else 4), drape=getattr(g, 'drape', None), neck_snug=snug)
        hidden[sh['hide']] = True
        col, nmap, rmap = fabric_maps(ctx, g.covered, g.color, seed=hash(g.name) % 97, knit=g.knit, fold=g.fold,
                                      rough=g.rough, decals=g.decals, extra=g.extra, shell=sh, pique=g.pique, rib_cuffs=g.rib_cuffs)
        cv2.imwrite(os.path.join(outdir, f'{g.name}.jpg'), col, [cv2.IMWRITE_JPEG_QUALITY, 88])
        cv2.imwrite(os.path.join(outdir, f'{g.name}_n.jpg'), nmap, [cv2.IMWRITE_JPEG_QUALITY, 88])
        cv2.imwrite(os.path.join(outdir, f'{g.name}_r.jpg'), rmap, [cv2.IMWRITE_JPEG_QUALITY, 88])
        from garments import smooth_shell_weights
        is_bottom = g.name in ('shorts', 'pants')
        Wg = smooth_shell_weights(sh, Wfull, bnames, iters=10 if is_bottom else 6,
                                  pelvis_bias=((g.snap or {}).get('y_high'), 0.7, ['root', 'spine05']) if is_bottom and (g.snap or {}).get('y_high') else None, ctx=ctx)
        if is_bottom and top_layer is not None:
            from garments import follow_top_layer
            Wg = follow_top_layer(ctx, sh, Wg, *top_layer)
        elif g.name in ('shirt', 'jacket', 'polo', 'top') and top_layer is None:
            tW = np.zeros((len(ctx.V), Wg.shape[1]), np.float64); tW[sh['src']] = Wg
            tcov = np.zeros(len(ctx.V), bool); tcov[sh['src']] = True
            top_layer = (tW, tcov)
        si, sw = M.top4(Wg)
        ex.add_part(g.name, to_m(sh['pos'], ground), sh['nrm'], sh['uv'], si, sw, sh['tris'].ravel(),
                    dict(type='cloth', map=f'{g.name}.jpg', normalMap=f'{g.name}_n.jpg', roughMap=f'{g.name}_r.jpg',
                         sheen=g.sheen, sheenColor=list(g.sheen_color), normalScale=g.normal_scale))
        print(f'  garment {g.name}: {len(sh["pos"])} verts, hides {len(sh["hide"])} faces')
        if g.collar:
            from garments import make_collar
            col_ = make_collar(ctx, sh, Wg if False else smooth_shell_weights(sh, Wfull, bnames, iters=4, ctx=ctx) if False else Wfull, **g.collar)
            if col_ is not None:
                # collar texture: rib knit along the collar, stitched edge
                CW, CH = 1024, 256
                ctex = np.zeros((CH, CW, 3), np.float32); ctex[:] = np.array(g.color, np.float32)[::-1] * 255
                yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)
                # (a fine, soft rib: a strong one made the collar a sweater's knitted band)
                rib = np.sin(xx * 1.6) * 0.5 + 0.5
                ctex *= (0.965 + 0.035 * rib[..., None])
                edge = (np.abs(yy - CH * 0.06) < 2) | (np.abs(yy - CH * 0.94) < 2)
                ctex[edge] *= 0.72
                cv2.imwrite(os.path.join(outdir, 'collar.jpg'), np.clip(ctex, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 90])
                hh = (np.sin(xx * 1.6)).astype(np.float32)
                from headtex import normal_from_height
                cv2.imwrite(os.path.join(outdir, 'collar_n.jpg'), normal_from_height(hh * 0.3, 1.0), [cv2.IMWRITE_JPEG_QUALITY, 90])
                csi, csw = M.top4(col_['W'])
                ex.add_part('collar', to_m(col_['pos'], ground), col_['nrm'], col_['uv'], csi, csw, col_['tris'].ravel(),
                            dict(type='cloth', map='collar.jpg', normalMap='collar_n.jpg', roughness=0.85, sheen=g.sheen,
                                 sheenColor=list(g.sheen_color), double=True))
                print(f'  collar: {len(col_["pos"])} verts')
        if g.buttons:
            from garments import surface_point
            bp_, bi_, bw_ = [], [], []
            for bdef in g.buttons:
                k, p, n = surface_point(ctx, 0.0, bdef['y'], 1.0)
                n = n / np.linalg.norm(n)
                cpos = p + n * (float(np.atleast_1d(g.offset if np.ndim(g.offset) == 0 else g.offset[k])[0]) + 0.02)
                # small disc button: 16 segments, radius 0.055 dm, thickness 0.02 dm
                t1 = np.cross(n, [0, 1.0, 0]); t1 /= np.linalg.norm(t1); t2 = np.cross(n, t1)
                base_i = len(bp_)
                ring = [cpos + (np.cos(a) * t1 + np.sin(a) * t2) * 0.055 for a in np.linspace(0, 2 * np.pi, 16, endpoint=False)]
                top_ = [q + n * 0.02 for q in ring]
                bp_ += ring + top_ + [cpos + n * 0.024]
                for j in range(16):
                    a_, b_ = base_i + j, base_i + (j + 1) % 16
                    bi_ += [[a_, b_, 16 + b_], [a_, 16 + b_, 16 + a_], [16 + a_, 16 + b_, base_i + 32]]
                bw_ += [Wfull[k]] * 33
            bp_ = np.array(bp_); bi_ = np.array(bi_)
            bsi, bsw = M.top4(np.array(bw_))
            ex.add_part('buttons', to_m(bp_, ground), R.vertex_normals(bp_, bi_), np.zeros((len(bp_), 2), np.float32), bsi, bsw, bi_.ravel(),
                        dict(type='cloth', color=[0.85, 0.72, 0.22], roughness=0.35, sheen=0.0))
    # shoes (MakeHuman proxy, delete_verts hide the feet)
    shoe = P.get('shoes', ('shoes05', None))
    sclo = M.load_mhclo(os.path.join(M.MHA, f'clothes/{shoe[0]}/{shoe[0]}.mhclo'))
    if sclo['delete']:
        dv = np.zeros(len(Vg), bool); dv[sclo['delete']] = True
        hidden |= dv[tris].any(1)
    shoe_tex(shoe, outdir)

    # ---- body mesh (head tris use head texture UVs)
    vi, ui, inv = split_verts(tris, tuv)
    nrm_all = R.vertex_normals(Vg, tris)
    uv_out = VT[ui].copy()
    is_head_uv = lab[ui] == head_label
    uv_out[is_head_uv] = head_uv(VT[ui[is_head_uv]])
    sidx, swt = M.top4(Wfull[vi])
    keep = np.ones(len(tris), bool); keep[head_tris] = False; keep &= ~hidden
    body_idx = inv[np.where(keep)[0]]
    head_idx = inv[head_tris]
    pos = to_m(Vg[vi], ground)
    ex.add_part('body', pos, nrm_all[vi], uv_out, sidx, swt, body_idx.ravel(),
                dict(type='skin', map='skin.jpg', normalMap='skin_n.jpg'))
    ex.add_part('head', pos, nrm_all[vi], uv_out, sidx, swt, head_idx.ravel(),
                dict(type='skin', map='head.jpg', normalMap='head_n.jpg', roughMap='head_r.jpg', head=True))
    # ---- fur-shell beard: head triangles under the beard density map, drawn as offset layers at runtime
    bo = tex.get('beard')
    if bo is not None:
        D = cv2.dilate(bo['dens'], np.ones((9, 9), np.uint8))
        px = np.clip((uv_out[:, 0] * HTW).astype(int), 0, HTW - 1)
        py = np.clip(((1 - uv_out[:, 1]) * HTH).astype(int), 0, HTH - 1)
        dvert = D[py, px]
        bsel = head_idx[dvert[head_idx].max(1) > 0.03]
        bv, binv = np.unique(bsel.ravel(), return_inverse=True)
        bc = np.array(P.get('beard_strand_color', P.get('beard_color', (60, 55, 52))), np.float32) / 255
        tile = 0.022  # strand tile size (m)
        bdef = dict(type='beard', map='beard_d.png', color=bc.tolist(), grey=P.get('beard_grey', 0.0),
                    length=P.get('beard_len', 0.0025), shells=P.get('beard_layers', 6),
                    scale=[HTW * bo['texel'][0] / tile, HTH * bo['texel'][1] / tile])
        if 'beard_grey_color' in P:
            # colour of the grey strands (salt-and-pepper stubble: white hairs among dark ones)
            bdef['greyColor'] = (np.array(P['beard_grey_color'], np.float32) / 255).tolist()
        if bo.get('grey_map'):
            bdef['greyMap'] = True  # (the share of grey strands is beard_d.png's green channel)
        ex.add_part('beard', pos[bv], nrm_all[vi][bv], uv_out[bv], sidx[bv], swt[bv], binv.reshape(-1, 3).ravel(), bdef)
        print('  beard shell tris', len(bsel))

    # ---- proxies
    def add_proxy(name, clo_path, mat, weights_override=None, split=None):
        clo = M.load_mhclo(clo_path)
        o = M.load_obj(clo['obj'])
        pv = M.fit_proxy(clo, Vg)
        ptris, ptuv = obj_tris(o)
        pn = R.vertex_normals(pv, ptris)
        Wp = M.proxy_weights(clo, Wfull)
        if weights_override is not None:
            Wp = weights_override(Wp)
        groups = [(name, np.ones(len(ptris), bool), mat)]
        if split is not None:
            groups = split(ptris, ptuv, o)
        for grp in groups:
            gname, sel, gmat = grp[:3]
            colfn = grp[3] if len(grp) > 3 else None
            pvi, pui, pinv = split_verts(ptris[sel], ptuv[sel])
            si, sw = M.top4(Wp[pvi])
            col = colfn(pv, pvi, ptris[sel]) if colfn else None
            ex.add_part(gname, to_m(pv[pvi], ground), pn[pvi], o['vt'][pui], si, sw, pinv.ravel(), gmat, color=col)
        return clo

    def eye_split(ptris, ptuv, o):
        u = o['vt'][ptuv[:, 0], 0]
        v = o['vt'][ptuv[:, 0], 1]
        cornea = (u > 0.85) & (v < 0.15)
        def eye_ao(pv, pvi, tr):
            # per-vertex occlusion from the lids: darker top, corners and bottom of the eyeball
            from scipy.sparse.csgraph import connected_components
            from scipy.sparse import coo_matrix
            n = len(pv)
            g = coo_matrix((np.ones(tr.size), (tr.ravel(), np.roll(tr, 1, 1).ravel())), shape=(n, n))
            _, lab = connected_components(g, directed=False)
            ao = np.ones(len(pvi), np.float32)
            for lb in np.unique(lab[pvi]):
                m = lab[pvi] == lb
                P = pv[pvi[m]]
                c = P.mean(0)
                d = P - c
                d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
                u, x = d[:, 1], np.abs(d[:, 0])
                a = 1 - 0.8 * np.clip((u - 0.05) / 0.4, 0, 1) - 0.35 * np.clip((-u - 0.3) / 0.35, 0, 1) - 0.3 * np.clip((x - 0.55) / 0.3, 0, 1)
                ao[m] = np.clip(a, 0.22, 1)
            return np.stack([ao, ao * 0.97, ao * 0.95], 1)
        return [('eyes', ~cornea, dict(type='eye', map='../../shared/eye_brown.webp'), eye_ao),
                ('cornea', cornea, dict(type='cornea'))]

    add_proxy('eyes', os.path.join(M.MHD, 'eyes/high-poly/high-poly.mhclo'), None, split=eye_split)
    add_proxy('eyelashes', os.path.join(M.MHA, 'eyelashes/eyelashes01/eyelashes01.mhclo'), dict(type='lash', map='../../shared/eyelashes.webp'))
    if not P.get('neutral_mouth', True):
        from facecam import bake_proxy_photo
        from facefit import LIPS_IN
        tclo = M.load_mhclo(os.path.join(M.MHA, 'teeth/teeth_base/teeth_base.mhclo'))
        tobj = M.load_obj(tclo['obj'])
        tpv = M.fit_proxy(tclo, Vtex)
        ttr, ttuv = obj_tris(tobj)
        tbase = cv2.imread(os.path.join(GAME, 'assets/shared/teeth.png'), cv2.IMREAD_UNCHANGED)
        photo_t = cv2.imread(os.path.join(TOOLS, 'photos', P['photo']))
        ttex = bake_proxy_photo(tpv, ttr, ttuv, tobj['vt'], tbase, photo_t, cam, LIPS_IN, grow=1.0, feather=3)
        cv2.imwrite(os.path.join(outdir, 'teeth.png'), ttex)
        add_proxy('teeth', os.path.join(M.MHA, 'teeth/teeth_base/teeth_base.mhclo'), dict(type='teeth', map='teeth.png'))
    else:
        add_proxy('teeth', os.path.join(M.MHA, 'teeth/teeth_base/teeth_base.mhclo'), dict(type='teeth', map='../../shared/teeth.webp'))
    add_proxy('shoes', os.path.join(M.MHA, f'clothes/{shoe[0]}/{shoe[0]}.mhclo'),
              dict(type='cloth', map='shoes.jpg', roughness=0.6, sheen=0.2))
    if P.get('hair_cards'):
        from hairgen import grow_hair
        from headtex import HeadFrame
        hc = P['hair_cards']
        frame = HeadFrame(Vg, head_vidx)
        el, az = frame.angles(Vg)
        fl = frame.el_of(10)
        hp = hc.get('hairline', {})
        xp = [0, 22, 40, 62, 80, 100, 125, 150, 180]
        fe, te = fl + hp.get('front', 4), fl + hp.get('temple', 2)
        se, be_ = hp.get('side', 14), hp.get('back', -42)
        fp = [fe, fe + (te - fe) * 0.6, te, (te + se) / 2, se, se - 2, -10, be_ + 6, be_]
        hline = np.interp(np.abs(az), xp, fp)
        if hp.get('tilt'):
            # a hairline higher on one side of the forehead (+: her left) and lower on the other, back to even by the
            # temples (hair swept off a side parting leaves the forehead bare on the parting's side)
            hline = hline + hp['tilt'] * np.clip(az / 40.0, -1, 1) * np.clip((70 - np.abs(az)) / 30, 0, 1)
        cover = np.clip((el - hline) / 6 + 0.5, 0, 1)
        cover[np.setdiff1d(np.arange(len(Vg)), head_vidx)] = 0
        htris = tris[head_tris]
        nrm_v = R.vertex_normals(Vg, tris)
        hc = dict(hc)
        if hc.get('stop_brows'):
            hc['stop_y'] = float(frame.lm[105][1] + 0.12)  # just above the eyebrows
        hc['face_top'] = float(frame.lm[10][1] + 0.05)  # hair may not fall over the forehead unless it is a fringe
        band = None
        if hc['comb'] == 'topknot':
            from hairgen import grow_topknot
            # only the top of the head (sides stay buzzed: texture stubble)
            top = np.clip((np.abs(az) < hc.get('band_az', 62)) * 1.0, 0, 1) * np.clip((el - hline) / 6 + 0.5, 0, 1)
            top = np.maximum(top, np.clip((el - hc.get('crown_el', 48)) / 6, 0, 1))
            cover = cover * top
            hp_, huv, hao, htan, hidx, band = grow_topknot(Vg, nrm_v, htris, cover, frame, hc, seed=7)
        elif hc['comb'] == 'bob':
            from hairgen import grow_bob
            # the strands may not enter the head, the face, the neck or the shoulders
            coll = np.where(Vg[:13380, 1] > ctx.y_neck - 0.8)[0]
            if os.environ.get('HAIRDUMP'):
                # (the inputs of the hair generator in a file, to iterate on a hairstyle without rebuilding the fighter)
                import pickle
                pickle.dump(dict(V=Vg, N=nrm_v, tris=htris, cover=cover, C=frame.C, lm=frame.lm, coll=coll, hc=hc), open(os.environ['HAIRDUMP'], 'wb'))
            hp_, huv, hao, htan, hidx = grow_bob(Vg, nrm_v, htris, cover, frame, hc, coll_idx=coll, seed=7)
        else:
            hp_, huv, hao, htan, hidx = grow_hair(Vg, nrm_v, htris, cover, frame, hc, seed=7)
        # normals: roughly the scalp normal (outward from the head centre), made perpendicular to the strand so
        # the anisotropic shading basis never degenerates (strands pointing straight out gave NaN pixels)
        hn = hp_ - frame.C
        hn /= np.linalg.norm(hn, axis=1, keepdims=True) + 1e-9
        tl_ = htan / (np.linalg.norm(htan, axis=1, keepdims=True) + 1e-9)
        hn = hn - tl_ * (hn * tl_).sum(1, keepdims=True)
        ln_ = np.linalg.norm(hn, axis=1, keepdims=True)
        alt = np.cross(tl_, np.array([0.0, 0.0, 1.0])); alt2 = np.cross(tl_, np.array([1.0, 0.0, 0.0]))
        alt = np.where(np.linalg.norm(alt, axis=1, keepdims=True) > 0.3, alt, alt2)
        alt /= np.linalg.norm(alt, axis=1, keepdims=True) + 1e-9
        hn = np.where(ln_ > 0.15, hn / (ln_ + 1e-9), alt)
        htan = tl_
        hi = bnames.index('head')
        si = np.zeros((len(hp_), 4), np.uint16); si[:, 0] = hi
        sw = np.zeros((len(hp_), 4), np.float32); sw[:, 0] = 1
        tang = np.concatenate([htan, np.ones((len(htan), 1), np.float32)], 1)
        col = np.stack([hao, hao, hao], 1)
        tint = P['hair_color']
        grey = P.get('hair_grey', 0.0)
        # shuffle strand order (strands = connected runs of triangles sharing vertices) for LOD by draw range
        tri_strand = np.zeros(len(hidx), np.int64)
        sid = 0
        for t in range(1, len(hidx)):
            if hidx[t].min() > hidx[t - 1].max():
                sid += 1
            tri_strand[t] = sid
        perm = np.random.default_rng(11).permutation(sid + 1)
        if grey > 0:
            # salt and pepper: a fraction of the strands is grey; the material tint becomes the grey and the dark
            # strands are scaled down through the vertex colour
            gcol = np.array(P.get('hair_grey_color', [0.24, 0.235, 0.23])); dcol = np.array(tint, np.float64)
            vstrand = np.zeros(len(hp_), np.int64); vstrand[hidx.ravel()] = np.repeat(tri_strand, 3)
            is_grey = np.random.default_rng(5).random(sid + 1) < grey
            ratio = np.where(is_grey[vstrand][:, None], 1.0, dcol[None] / gcol[None])
            col = col * ratio
            tint = tuple(gcol.tolist())
        order = np.argsort(perm[tri_strand], kind='stable')
        hidx = hidx[order]
        ex.add_part('hair', to_m(hp_, ground), hn, huv, si, sw, hidx.ravel(),
                    dict(type='haircards', lod=True, map='../../shared/' + hc.get('atlas', 'hair_cards_s.png').replace('.png', '.webp'), tint=list(tint)), color=col, tangent=tang)
        print(f'  hair cards: {len(hp_)} verts, {len(hidx)} tris')
        if band is not None:
            # elastic hair tie around the knot
            tor_p, tor_i = [], []
            ax = band['axis']; e1 = np.cross(ax, [0, 1.0, 0]); e1 /= np.linalg.norm(e1); e2 = np.cross(ax, e1)
            R0, r0 = band['radius'], 0.022
            nu, nv = 24, 8
            for i in range(nu):
                a = 2 * np.pi * i / nu
                cdir = np.cos(a) * e1 + np.sin(a) * e2
                for j in range(nv):
                    b = 2 * np.pi * j / nv
                    tor_p.append(band['center'] + cdir * (R0 + r0 * np.cos(b)) + ax * r0 * np.sin(b))
            for i in range(nu):
                for j in range(nv):
                    a_ = i * nv + j; b_ = ((i + 1) % nu) * nv + j; c_ = ((i + 1) % nu) * nv + (j + 1) % nv; d_ = i * nv + (j + 1) % nv
                    tor_i += [[a_, b_, c_], [a_, c_, d_]]
            tor_p = np.array(tor_p); tor_i = np.array(tor_i)
            tn = R.vertex_normals(tor_p, tor_i)
            si2 = np.zeros((len(tor_p), 4), np.uint16); si2[:, 0] = hi
            sw2 = np.zeros((len(tor_p), 4), np.float32); sw2[:, 0] = 1
            ex.add_part('hairtie', to_m(tor_p, ground), tn, np.zeros((len(tor_p), 2), np.float32), si2, sw2, tor_i.ravel(),
                        dict(type='cloth', color=[0.02, 0.02, 0.025], roughness=0.5, sheen=0.1))
            # solid core inside the bun (so the knot never looks see-through)
            sp, si_ = [], []
            nu, nv = 18, 12
            for i in range(nv + 1):
                th = np.pi * i / nv
                for j in range(nu):
                    ph = 2 * np.pi * j / nu
                    sp.append(band['bun_center'] + band['bun_r'] * 0.86 * np.array([np.sin(th) * np.cos(ph), np.cos(th), np.sin(th) * np.sin(ph)]))
            for i in range(nv):
                for j in range(nu):
                    a_ = i * nu + j; b_ = i * nu + (j + 1) % nu; c_ = (i + 1) * nu + (j + 1) % nu; d_ = (i + 1) * nu + j
                    si_ += [[a_, d_, c_], [a_, c_, b_]]
            sp = np.array(sp); si_ = np.array(si_)
            snr = R.vertex_normals(sp, si_)
            si3 = np.zeros((len(sp), 4), np.uint16); si3[:, 0] = hi
            sw3 = np.zeros((len(sp), 4), np.float32); sw3[:, 0] = 1
            hcol = [float(c) * 0.9 for c in P['hair_color']]
            ex.add_part('buncore', to_m(sp, ground), snr, np.zeros((len(sp), 2), np.float32), si3, sw3, si_.ravel(),
                        dict(type='cloth', color=hcol, roughness=0.55, sheen=0.4, sheenColor=[0.1, 0.09, 0.08]))
    elif P.get('hair'):
        h = P['hair']
        src = cv2.imread(os.path.join(M.MHA, f'hair/{h}/{h}_diffuse.png'), cv2.IMREAD_UNCHANGED)
        lum = cv2.cvtColor(src[..., :3], cv2.COLOR_BGR2GRAY).astype(np.float32)
        a = src[..., 3].astype(np.float32) / 255 if src.shape[2] == 4 else np.ones_like(lum)
        ml = lum[a > 0.5].mean() + 1e-3
        rel = np.clip(lum / ml, 0.25, 2.2)
        hc = np.array(P['hair_color'], np.float32)[::-1] * 255  # RGB 0-1 -> BGR 0-255
        grey = P.get('hair_grey', 0.0)
        tint = hc[None, None] * rel[..., None]
        if grey > 0:
            gm = (np.random.default_rng(3).random(lum.shape) < grey).astype(np.float32)
            gm = cv2.GaussianBlur(gm, (0, 0), 0.7)
            tint = tint * (1 - gm[..., None]) + np.array([150, 150, 152], np.float32) * rel[..., None] * gm[..., None]
        out = np.dstack([np.clip(tint, 0, 255), a * 255]).astype(np.uint8)
        cv2.imwrite(os.path.join(outdir, 'hair.png'), out)
        nmat = dict(type='hair', map='hair.png', color=[1, 1, 1], tint=P['hair_color'])
        if os.path.exists(os.path.join(GAME, f'assets/shared/hair_{h}_n.png')):
            nmat['normalMap'] = f'../../shared/hair_{h}_n.png'
        add_proxy('hair', os.path.join(M.MHA, f'hair/{h}/{h}.mhclo'), nmat)

    # ---- eyebrows: short cards on the brow ridge (the photo texture keeps the colour underneath)
    if P.get('brows', False):  # experimental: sub-pixel cards read as dashes at game distances
        from hairgen import grow_brows
        from headtex import HeadFrame
        frame_b = HeadFrame(Vg, head_vidx)
        nrm_b = R.vertex_normals(Vg, tris)
        bp_, buv_, bao_, btan_, bidx_ = grow_brows(Vg, nrm_b, tris[head_tris], frame_b, n_per=P.get('brow_n', 650))
        if len(bp_):
            bn_ = bp_ - frame_b.C; bn_ /= np.linalg.norm(bn_, axis=1, keepdims=True) + 1e-9
            tl_ = btan_ / (np.linalg.norm(btan_, axis=1, keepdims=True) + 1e-9)
            bn_ = bn_ - tl_ * (bn_ * tl_).sum(1, keepdims=True); bn_ /= np.linalg.norm(bn_, axis=1, keepdims=True) + 1e-9
            hi_b = bnames.index('head')
            si_b = np.zeros((len(bp_), 4), np.uint16); si_b[:, 0] = hi_b
            sw_b = np.zeros((len(bp_), 4), np.float32); sw_b[:, 0] = 1
            bcol = np.array(P.get('brow_color', [c * 0.8 for c in P.get('hair_color', (0.03, 0.025, 0.02))]), np.float32)
            ex.add_part('brows', to_m(bp_, ground), bn_, buv_, si_b, sw_b, bidx_.ravel(),
                        dict(type='haircards', map='../../shared/hair_cards.webp', tint=bcol.tolist()),
                        color=np.stack([bao_, bao_, bao_], 1), tangent=np.concatenate([tl_, np.ones((len(tl_), 1), np.float32)], 1))
            print(f'  brows: {len(bp_)} verts')
    extra = dict(
        id=pid, display=P['display'],
        bones=[dict(name=b['name'], parent=(bnames.index(b['parent']) if b['parent'] else -1),
                    head=(to_m(b['head'][None], ground)[0]).round(5).tolist(),
                    tail=(to_m(b['tail'][None], ground)[0]).round(5).tolist()) for b in bones],
        glasses=P.get('glasses'),
        height=float((Vg[:13380, 1].max() - ground) * UNIT),
    )
    ex.write(os.path.join(outdir, 'mesh.json'), os.path.join(outdir, 'mesh.bin'), extra)
    raw = os.path.getsize(os.path.join(outdir, 'mesh.bin'))
    # quantized for the game (meshfmt.py: a third of the download, invisible errors) and gzip-precompressed (inflated in
    # the browser with DecompressionStream)
    import meshfmt
    meta_, parts_ = meshfmt.load(outdir)
    meshfmt.save(outdir, meta_, parts_, quantized=True)
    print('  exported', raw // 1024, 'KB raw ->', os.path.getsize(os.path.join(outdir, 'mesh.bin.gz')) // 1024, 'KB quantized and gzipped; height', round(extra['height'], 3))
    if P.get('shoes_nb'):
        # New Balance trainers painted from the shoe's shape, the N on both sides (nbshoes.py)
        import nbshoes
        nbshoes.build(outdir, P['shoes_nb'])


def shared_assets():
    d = os.path.join(GAME, 'assets/shared')
    os.makedirs(d, exist_ok=True)
    from hairgen import strand_atlas
    cv2.imwrite(os.path.join(d, 'hair_cards.png'), strand_atlas(1, False))
    cv2.imwrite(os.path.join(d, 'hair_cards_curly.png'), strand_atlas(2, True))
    # the same strands with the dense roots at the card's root (see strand_atlas)
    cv2.imwrite(os.path.join(d, 'hair_cards_r.png'), strand_atlas(1, False, roots_v0=True))
    cv2.imwrite(os.path.join(d, 'hair_cards_curly_r.png'), strand_atlas(2, True, roots_v0=True))
    # dense roots that fade in over the first few percent of the card: no hard line along the hairline
    cv2.imwrite(os.path.join(d, 'hair_cards_s.png'), strand_atlas(1, False, roots_v0=True, root_fade=0.07))
    cv2.imwrite(os.path.join(d, 'hair_cards_curly_s.png'), strand_atlas(2, True, roots_v0=True, root_fade=0.07))
    # the game loads WebP copies (a tenth of the size, the alpha kept exact); the PNGs stay as the sources
    from PIL import Image as _Image
    for n in ('hair_cards', 'hair_cards_curly', 'hair_cards_r', 'hair_cards_curly_r', 'hair_cards_s', 'hair_cards_curly_s'):
        _Image.open(os.path.join(d, n + '.png')).save(os.path.join(d, n + '.webp'), 'WEBP', quality=90, alpha_quality=100, method=6)
    import shutil
    eye = cv2.imread(os.path.join(M.MHA, 'eyes/materials/brownlight_eye.png'), cv2.IMREAD_UNCHANGED)
    hsv = cv2.cvtColor(eye[..., :3], cv2.COLOR_BGR2HSV).astype(np.float32)
    iris = cv2.GaussianBlur(((hsv[..., 1] > 70) & (hsv[..., 2] < 235)).astype(np.float32), (0, 0), 2)
    darker = eye[..., :3].astype(np.float32) * np.array([0.44, 0.52, 0.64])  # BGR: dark brown iris (no specular veil greys it now)
    eye[..., :3] = np.clip(eye[..., :3] * (1 - iris[..., None]) + darker * iris[..., None], 0, 255).astype(np.uint8)
    sclera = (1 - iris)[..., None]
    base = eye[..., :3].astype(np.float32)
    # off-white, slightly warm sclera with a subtle vascular pink towards the edges
    yy, xx = np.mgrid[0:eye.shape[0], 0:eye.shape[1]].astype(np.float32) / eye.shape[0]
    base = base * (1 - sclera * 0.24) * np.array([0.93, 0.95, 1.0])
    eye[..., :3] = np.clip(base, 0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(d, 'eye_brown.png'), eye)
    shutil.copy(os.path.join(M.MHA, 'eyelashes/eyelashes01/eyelashes01.png'), os.path.join(d, 'eyelashes.png'))
    t = cv2.imread(os.path.join(M.MHA, 'teeth/materials/teeth.png'), cv2.IMREAD_UNCHANGED)
    cv2.imwrite(os.path.join(d, 'teeth.png'), cv2.resize(t, (1024, 1024), interpolation=cv2.INTER_AREA))
    for n in ('eye_brown', 'eyelashes', 'teeth'):
        _Image.open(os.path.join(d, n + '.png')).save(os.path.join(d, n + '.webp'), 'WEBP', quality=90, alpha_quality=100, method=6)
    for h in ('short01', 'short02', 'short04'):
        dif = cv2.imread(os.path.join(M.MHA, f'hair/{h}/{h}_diffuse.png'), cv2.IMREAD_UNCHANGED)
        cv2.imwrite(os.path.join(d, f'hair_{h}.png'), dif)
        np_ = os.path.join(M.MHA, f'hair/{h}/{h}_normal.png')
        if os.path.exists(np_):
            nm = cv2.imread(np_)
            if nm is not None:
                cv2.imwrite(os.path.join(d, f'hair_{h}_n.png'), nm)


if __name__ == '__main__':
    ids = sys.argv[1:] or list(PEOPLE)
    if 'shared' in ids:
        shared_assets(); ids.remove('shared')
    for pid in ids:
        build(pid)
