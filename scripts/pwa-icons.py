#!/usr/bin/env python3
"""
Gera os ícones do PWA (GreenScore IA) sem depender de PIL/ImageMagick.

Desenho: bola de futebol geométrica (aro + pentágono + 5 raios) em verde neon
sobre o fundo do app (#001e28). Antialias por supersampling.

Uso: python3 scripts/pwa-icons.py
Saída: public/icon-192x192.png, public/icon-512x512.png, public/icon-maskable-512.png
"""
import math
import struct
import zlib

BG = (0x00, 0x1e, 0x28)
ACC = (0x1f, 0xbf, 0x75)
ACC2 = (0x8e, 0xe0, 0xb5)


def write_png(path, width, height, rgba):
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # filtro None
        raw += rgba[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def blend(dst, src, alpha):
    if alpha <= 0:
        return dst
    if alpha >= 1:
        return src
    return tuple(int(round(dst[i] + (src[i] - dst[i]) * alpha)) for i in range(3))


def render(size, art_scale=1.0, rounded=True, ss=3):
    """
    art_scale: fração do lado usada pela arte (maskable usa ~0.72 para caber na safe zone).
    rounded: cantos arredondados (ícone normal); maskable é full-bleed.
    ss: supersampling.
    """
    W = size * ss
    buf = [None] * (W * W)  # RGBA float (r,g,b,a) normalizado por alpha
    R_out = W * 0.5
    corner = W * 0.22

    for y in range(W):
        fy = (y + 0.5) / W - 0.5
        for x in range(W):
            fx = (x + 0.5) / W - 0.5
            px = fx * W
            py = fy * W

            # --- máscara do ícone (quadrado arredondado) ---
            if rounded:
                dx = abs(px)
                dy = abs(py)
                lim = R_out - corner
                if dx > lim and dy > lim:
                    d = math.hypot(dx - lim, dy - lim)
                    if d > corner:
                        buf[y * W + x] = (0, 0, 0, 0)
                        continue

            col = BG
            a = 1.0

            # --- geometria da bola, em unidades do lado ---
            s = 0.5 * art_scale  # escala da arte
            cx = fx / art_scale
            cy = fy / art_scale
            r = math.hypot(cx, cy)

            R = 0.30
            ring_w = 0.052
            rp = 0.125  # pentágono
            spoke_w = 0.020

            # halo suave
            if r < R + 0.10:
                t = max(0.0, 1.0 - (r - R) / 0.10)
                col = blend(col, ACC, 0.10 * t * t)

            # aro
            dr = abs(r - R)
            if dr < ring_w / 2 + 0.012:
                edge = min(1.0, (ring_w / 2 + 0.012 - dr) / 0.012)
                col = blend(col, ACC, edge)
                if dr < ring_w / 2 - 0.012:
                    col = ACC

            # pentágono central preenchido
            ang = math.atan2(cy, cx)
            # distância até a borda do pentágono (apótema por ângulo)
            apot = rp * math.cos(math.pi / 5) / math.cos(((ang + math.pi / 2) % (2 * math.pi / 5)) - math.pi / 5)
            if r <= apot:
                col = ACC2

            # 5 raios do pentágono até o aro
            for k in range(5):
                va = -math.pi / 2 + k * 2 * math.pi / 5
                vx, vy = math.cos(va) * rp, math.sin(va) * rp
                ux, uy = math.cos(va), math.sin(va)
                # distância ponto→segmento
                pxr, pyr = cx - vx, cy - vy
                t = max(0.0, min(R - ring_w / 2 - rp, pxr * ux + pyr * uy))
                ddx, ddy = pxr - ux * t, pyr - uy * t
                d = math.hypot(ddx, ddy)
                if d < spoke_w / 2:
                    col = blend(col, ACC, min(1.0, (spoke_w / 2 - d) / 0.008))
                elif d < spoke_w / 2 + 0.008:
                    col = blend(col, ACC, (spoke_w / 2 + 0.008 - d) / 0.008)

            buf[y * W + x] = (col[0], col[1], col[2], a)

    # --- downsample com média (antialias) ---
    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0.0
            for dy in range(ss):
                row = (y * ss + dy) * W
                for dx in range(ss):
                    p = buf[row + x * ss + dx]
                    r += p[0] * p[3]
                    g += p[1] * p[3]
                    b += p[2] * p[3]
                    a += p[3]
            n = ss * ss
            a /= n
            i = (y * size + x) * 4
            if a > 0.002:
                out[i] = int(round(min(255, r / (a * n))))
                out[i + 1] = int(round(min(255, g / (a * n))))
                out[i + 2] = int(round(min(255, b / (a * n))))
                out[i + 3] = int(round(a * 255))
            else:
                out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0
    return out


if __name__ == "__main__":
    jobs = [
        ("public/icon-192x192.png", 192, 1.0, True, 3),
        ("public/icon-512x512.png", 512, 1.0, True, 2),
        ("public/icon-maskable-512.png", 512, 0.72, False, 2),
    ]
    for path, size, scale, rounded, ss in jobs:
        px = render(size, art_scale=scale, rounded=rounded, ss=ss)
        write_png(path, size, size, px)
        print(f"ok {path} {size}x{size}")
