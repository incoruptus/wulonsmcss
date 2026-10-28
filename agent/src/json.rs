//! 极简 JSON：够 agent 用就行（无第三方依赖，编译产物更小）

#[derive(Clone, Debug)]
pub enum Json {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Json>),
    Obj(Vec<(String, Json)>),
}

impl Json {
    pub fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Json::Obj(items) => items.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn str(&self) -> Option<&str> {
        match self {
            Json::Str(s) => Some(s),
            _ => None,
        }
    }

    pub fn num(&self) -> Option<f64> {
        match self {
            Json::Num(n) => Some(*n),
            _ => None,
        }
    }

    pub fn bool(&self) -> Option<bool> {
        match self {
            Json::Bool(b) => Some(*b),
            _ => None,
        }
    }

    pub fn arr(&self) -> Option<&Vec<Json>> {
        match self {
            Json::Arr(a) => Some(a),
            _ => None,
        }
    }

    pub fn s(v: &str) -> Json {
        Json::Str(v.to_string())
    }

    pub fn n(v: f64) -> Json {
        Json::Num(v)
    }

    pub fn obj(items: Vec<(&str, Json)>) -> Json {
        Json::Obj(items.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
    }

    pub fn to_string(&self) -> String {
        let mut out = String::new();
        self.write(&mut out);
        out
    }

    fn write(&self, out: &mut String) {
        match self {
            Json::Null => out.push_str("null"),
            Json::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            Json::Num(n) => {
                if n.fract() == 0.0 && n.abs() < 1e15 {
                    out.push_str(&format!("{}", *n as i64));
                } else {
                    out.push_str(&format!("{}", n));
                }
            }
            Json::Str(s) => {
                out.push('"');
                for ch in s.chars() {
                    match ch {
                        '"' => out.push_str("\\\""),
                        '\\' => out.push_str("\\\\"),
                        '\n' => out.push_str("\\n"),
                        '\r' => out.push_str("\\r"),
                        '\t' => out.push_str("\\t"),
                        c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
                        c => out.push(c),
                    }
                }
                out.push('"');
            }
            Json::Arr(items) => {
                out.push('[');
                for (i, v) in items.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    v.write(out);
                }
                out.push(']');
            }
            Json::Obj(items) => {
                out.push('{');
                for (i, (k, v)) in items.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    Json::Str(k.clone()).write(out);
                    out.push(':');
                    v.write(out);
                }
                out.push('}');
            }
        }
    }

    pub fn parse(text: &str) -> Result<Json, String> {
        let mut p = Parser {
            bytes: text.as_bytes(),
            i: 0,
        };
        p.ws();
        let v = p.value()?;
        p.ws();
        if p.i != p.bytes.len() {
            return Err(format!("JSON 末尾有多余内容（位置 {}）", p.i));
        }
        Ok(v)
    }
}

struct Parser<'a> {
    bytes: &'a [u8],
    i: usize,
}

impl<'a> Parser<'a> {
    fn ws(&mut self) {
        while self.i < self.bytes.len() && (self.bytes[self.i] as char).is_whitespace() {
            self.i += 1;
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.i).copied()
    }

    fn value(&mut self) -> Result<Json, String> {
        self.ws();
        match self.peek() {
            None => Err("JSON 意外结束".into()),
            Some(b'n') => self.literal("null", Json::Null),
            Some(b't') => self.literal("true", Json::Bool(true)),
            Some(b'f') => self.literal("false", Json::Bool(false)),
            Some(b'"') => Ok(Json::Str(self.string()?)),
            Some(b'[') => self.array(),
            Some(b'{') => self.object(),
            Some(_) => self.number(),
        }
    }

    fn literal(&mut self, word: &str, v: Json) -> Result<Json, String> {
        if self.bytes.len() >= self.i + word.len() && &self.bytes[self.i..self.i + word.len()] == word.as_bytes() {
            self.i += word.len();
            Ok(v)
        } else {
            Err(format!("无法识别的字面量（位置 {}）", self.i))
        }
    }

    fn string(&mut self) -> Result<String, String> {
        self.i += 1; // 跳过开引号
        let mut out = String::new();
        while let Some(b) = self.peek() {
            self.i += 1;
            match b {
                b'"' => return Ok(out),
                b'\\' => {
                    let esc = self.peek().ok_or("字符串转义不完整")?;
                    self.i += 1;
                    match esc {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'b' => out.push('\u{8}'),
                        b'f' => out.push('\u{c}'),
                        b'n' => out.push('\n'),
                        b'r' => out.push('\r'),
                        b't' => out.push('\t'),
                        b'u' => {
                            let hex = self.take(4)?;
                            let code = u32::from_str_radix(&hex, 16).map_err(|_| "非法 \\u 转义")?;
                            out.push(char::from_u32(code).unwrap_or('\u{fffd}'));
                        }
                        _ => return Err("未知转义".into()),
                    }
                }
                _ => {
                    // 逐字节还原 UTF-8
                    let start = self.i - 1;
                    let len = utf8_len(b);
                    let end = (start + len).min(self.bytes.len());
                    out.push_str(std::str::from_utf8(&self.bytes[start..end]).unwrap_or("\u{fffd}"));
                    self.i = end;
                }
            }
        }
        Err("字符串没有结束引号".into())
    }

    fn take(&mut self, n: usize) -> Result<String, String> {
        if self.i + n > self.bytes.len() {
            return Err("JSON 意外结束".into());
        }
        let s = std::str::from_utf8(&self.bytes[self.i..self.i + n])
            .map_err(|_| "非法 UTF-8")?
            .to_string();
        self.i += n;
        Ok(s)
    }

    fn number(&mut self) -> Result<Json, String> {
        let start = self.i;
        while let Some(b) = self.peek() {
            if b == b',' || b == b']' || b == b'}' || (b as char).is_whitespace() {
                break;
            }
            self.i += 1;
        }
        let text = std::str::from_utf8(&self.bytes[start..self.i]).map_err(|_| "非法数字")?;
        text.parse::<f64>()
            .map(Json::Num)
            .map_err(|_| format!("非法数字：{}", text))
    }

    fn array(&mut self) -> Result<Json, String> {
        self.i += 1;
        let mut items = Vec::new();
        self.ws();
        if self.peek() == Some(b']') {
            self.i += 1;
            return Ok(Json::Arr(items));
        }
        loop {
            let v = self.value()?;
            items.push(v);
            self.ws();
            match self.peek() {
                Some(b',') => {
                    self.i += 1;
                }
                Some(b']') => {
                    self.i += 1;
                    return Ok(Json::Arr(items));
                }
                _ => return Err("数组格式错误".into()),
            }
        }
    }

    fn object(&mut self) -> Result<Json, String> {
        self.i += 1;
        let mut items = Vec::new();
        self.ws();
        if self.peek() == Some(b'}') {
            self.i += 1;
            return Ok(Json::Obj(items));
        }
        loop {
            self.ws();
            if self.peek() != Some(b'"') {
                return Err("对象的键必须是字符串".into());
            }
            let key = self.string()?;
            self.ws();
            if self.peek() != Some(b':') {
                return Err("对象缺少冒号".into());
            }
            self.i += 1;
            let v = self.value()?;
            items.push((key, v));
            self.ws();
            match self.peek() {
                Some(b',') => {
                    self.i += 1;
                }
                Some(b'}') => {
                    self.i += 1;
                    return Ok(Json::Obj(items));
                }
                _ => return Err("对象格式错误".into()),
            }
        }
    }
}

fn utf8_len(first: u8) -> usize {
    if first < 0x80 {
        1
    } else if first >> 5 == 0b110 {
        2
    } else if first >> 4 == 0b1110 {
        3
    } else {
        4
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let text = r#"{"a":1,"b":[true,null,"x"],"c":{"d":-2.5}}"#;
        let v = Json::parse(text).unwrap();
        assert_eq!(v.get("a").unwrap().num(), Some(1.0));
        assert_eq!(v.get("b").unwrap().arr().unwrap().len(), 3);
        let out = v.to_string();
        let v2 = Json::parse(&out).unwrap();
        assert_eq!(v2.get("c").unwrap().get("d").unwrap().num(), Some(-2.5));
    }

    #[test]
    fn chinese_strings() {
        let v = Json::parse(r#"{"name":"朋友的服"}"#).unwrap();
        assert_eq!(v.get("name").unwrap().str(), Some("朋友的服"));
        assert!(v.to_string().contains("朋友的服"));
    }
}
