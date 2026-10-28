//! 纯 Rust 的 SHA-1（零依赖）
//!
//! 备份去重要按文件内容取键。标准库没有摘要算法，引 crate 又和「零第三方依赖」冲突，
//! 所以这里实现一份最小的 SHA-1，只给备份用。

pub struct Sha1 {
    state: [u32; 5],
    buffer: [u8; 64],
    buffered: usize,
    length_bits: u64,
}

impl Sha1 {
    pub fn new() -> Self {
        Self {
            state: [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0],
            buffer: [0u8; 64],
            buffered: 0,
            length_bits: 0,
        }
    }

    pub fn update(&mut self, mut data: &[u8]) {
        self.length_bits = self.length_bits.wrapping_add((data.len() as u64) * 8);

        if self.buffered > 0 {
            let need = 64 - self.buffered;
            let take = need.min(data.len());
            self.buffer[self.buffered..self.buffered + take].copy_from_slice(&data[..take]);
            self.buffered += take;
            data = &data[take..];
            if self.buffered == 64 {
                let block = self.buffer;
                self.compress(&block);
                self.buffered = 0;
            }
        }

        while data.len() >= 64 {
            let mut block = [0u8; 64];
            block.copy_from_slice(&data[..64]);
            self.compress(&block);
            data = &data[64..];
        }

        if !data.is_empty() {
            self.buffer[..data.len()].copy_from_slice(data);
            self.buffered = data.len();
        }
    }

    pub fn finish(mut self) -> [u8; 20] {
        let bit_len = self.length_bits;
        self.update_raw(&[0x80]);
        while self.buffered != 56 {
            self.update_raw(&[0x00]);
        }
        self.update_raw(&bit_len.to_be_bytes());
        let mut out = [0u8; 20];
        for (i, word) in self.state.iter().enumerate() {
            out[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
        }
        out
    }

    /// 只更新缓冲，不改长度（用于补位）
    fn update_raw(&mut self, data: &[u8]) {
        for byte in data {
            self.buffer[self.buffered] = *byte;
            self.buffered += 1;
            if self.buffered == 64 {
                let block = self.buffer;
                self.compress(&block);
                self.buffered = 0;
            }
        }
    }

    fn compress(&mut self, block: &[u8; 64]) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([block[i * 4], block[i * 4 + 1], block[i * 4 + 2], block[i * 4 + 3]]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }

        let [mut a, mut b, mut c, mut d, mut e] = self.state;
        for (i, word) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDC),
                _ => (b ^ c ^ d, 0xCA62C1D6),
            };
            let tmp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(*word);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = tmp;
        }

        self.state[0] = self.state[0].wrapping_add(a);
        self.state[1] = self.state[1].wrapping_add(b);
        self.state[2] = self.state[2].wrapping_add(c);
        self.state[3] = self.state[3].wrapping_add(d);
        self.state[4] = self.state[4].wrapping_add(e);
    }
}

pub fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

pub fn sha1_hex(data: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(data);
    hex(&hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn known_vectors() {
        assert_eq!(sha1_hex(b""), "da39a3ee5e6b4b0d3255bfef95601890afd80709");
        assert_eq!(sha1_hex(b"abc"), "a9993e364706816aba3e25717850c26c9cd0d89d");
        assert_eq!(
            sha1_hex(b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
            "84983e441c3bd26ebaae4aa1f95129e5e54670f1"
        );
    }

    #[test]
    fn long_input_matches_std_shape() {
        // 100 万个 'a'（跨多个块），长度与分块逻辑都可能出错
        let data = vec![b'a'; 1_000_000];
        assert_eq!(sha1_hex(&data), "34aa973cd4c4daa4f61eeb2bdbad27316534016f");
    }

    #[test]
    fn streaming_equals_oneshot() {
        let data: Vec<u8> = (0..1000u32).map(|i| (i % 251) as u8).collect();
        let mut hasher = Sha1::new();
        for chunk in data.chunks(37) {
            hasher.update(chunk);
        }
        assert_eq!(hex(&hasher.finish()), sha1_hex(&data));
    }

    #[test]
    fn reads_file_in_chunks() {
        let path = std::env::temp_dir().join("mcss-sha1-test.bin");
        std::fs::write(&path, b"hello world").unwrap();
        let mut file = std::fs::File::open(&path).unwrap();
        let mut hasher = Sha1::new();
        let mut buf = [0u8; 3];
        loop {
            let n = file.read(&mut buf).unwrap();
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
        }
        assert_eq!(hex(&hasher.finish()), "2aae6c35c94fcfb415dbe95f408b9ce91ee846ed");
        let _ = std::fs::remove_file(&path);
    }
}
