// ╔══════════════════════════════════════════════════════════════════╗
// ║                                                                  ║
// ║                   ELAH — A GREYFOUNDRY PROJECT                   ║
// ║                                                                  ║
// ║               https://github.com/greyfoundry/elah                ║
// ║                                                                  ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// Copyright © 2026 Greyfoundry contributors.
// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// SPDX-License-Identifier: Apache-2.0
//

const COMPOUND_TAG: u8 = 10;
const MAX_NBT_DEPTH: usize = 512;

pub(crate) fn validate_structure(bytes: &[u8], max_sequence_elements: usize) -> Result<(), String> {
    let mut cursor = Cursor::new(bytes);
    let root_tag = cursor.byte()?;
    if root_tag != COMPOUND_TAG {
        return Err(format!(
            "root tag must be a compound (10), found {root_tag}"
        ));
    }
    cursor.string_bytes()?;
    cursor.value(COMPOUND_TAG, 0, max_sequence_elements)?;
    if cursor.remaining() != 0 {
        return Err(format!(
            "{} trailing bytes follow the root compound",
            cursor.remaining()
        ));
    }
    Ok(())
}

struct Cursor<'a> {
    bytes: &'a [u8],
    position: usize,
}

impl<'a> Cursor<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, position: 0 }
    }

    fn remaining(&self) -> usize {
        self.bytes.len() - self.position
    }

    fn take(&mut self, length: usize) -> Result<&'a [u8], String> {
        let end = self
            .position
            .checked_add(length)
            .ok_or_else(|| "NBT byte offset overflowed".to_owned())?;
        let value = self
            .bytes
            .get(self.position..end)
            .ok_or_else(|| "NBT payload is truncated".to_owned())?;
        self.position = end;
        Ok(value)
    }

    fn byte(&mut self) -> Result<u8, String> {
        Ok(self.take(1)?[0])
    }

    fn u16(&mut self) -> Result<u16, String> {
        Ok(u16::from_be_bytes(
            self.take(2)?.try_into().expect("two bytes"),
        ))
    }

    fn i32(&mut self) -> Result<i32, String> {
        Ok(i32::from_be_bytes(
            self.take(4)?.try_into().expect("four bytes"),
        ))
    }

    fn string_bytes(&mut self) -> Result<(), String> {
        let length = usize::from(self.u16()?);
        self.take(length)?;
        Ok(())
    }

    fn sequence_length(&mut self, maximum: usize) -> Result<usize, String> {
        let signed = self.i32()?;
        let length = usize::try_from(signed)
            .map_err(|_| format!("NBT sequence length is negative: {signed}"))?;
        if length > maximum {
            return Err(format!(
                "NBT sequence contains {length} elements; limit is {maximum}"
            ));
        }
        Ok(length)
    }

    fn value(&mut self, tag: u8, depth: usize, max_sequence_elements: usize) -> Result<(), String> {
        if depth > MAX_NBT_DEPTH {
            return Err(format!("NBT nesting exceeds {MAX_NBT_DEPTH} levels"));
        }
        match tag {
            1 => {
                self.take(1)?;
            }
            2 => {
                self.take(2)?;
            }
            3 | 5 => {
                self.take(4)?;
            }
            4 | 6 => {
                self.take(8)?;
            }
            7 => {
                let length = self.sequence_length(max_sequence_elements)?;
                self.take(length)?;
            }
            8 => self.string_bytes()?,
            9 => {
                let element_tag = self.byte()?;
                let length = self.sequence_length(max_sequence_elements)?;
                if element_tag == 0 && length != 0 {
                    return Err("a non-empty NBT list cannot contain End tags".to_owned());
                }
                if element_tag > 12 {
                    return Err(format!("NBT list has unknown element tag {element_tag}"));
                }
                let child_depth = depth
                    .checked_add(1)
                    .ok_or_else(|| "NBT nesting depth overflowed".to_owned())?;
                for _ in 0..length {
                    self.value(element_tag, child_depth, max_sequence_elements)?;
                }
            }
            10 => {
                let child_depth = depth
                    .checked_add(1)
                    .ok_or_else(|| "NBT nesting depth overflowed".to_owned())?;
                loop {
                    let child_tag = self.byte()?;
                    if child_tag == 0 {
                        break;
                    }
                    if child_tag > 12 {
                        return Err(format!("NBT compound has unknown tag {child_tag}"));
                    }
                    self.string_bytes()?;
                    self.value(child_tag, child_depth, max_sequence_elements)?;
                }
            }
            11 => {
                let length = self.sequence_length(max_sequence_elements)?;
                self.take(
                    length
                        .checked_mul(4)
                        .ok_or_else(|| "NBT int-array byte length overflowed".to_owned())?,
                )?;
            }
            12 => {
                let length = self.sequence_length(max_sequence_elements)?;
                self.take(
                    length
                        .checked_mul(8)
                        .ok_or_else(|| "NBT long-array byte length overflowed".to_owned())?,
                )?;
            }
            0 => return Err("an End tag is not a standalone NBT value".to_owned()),
            _ => return Err(format!("NBT contains unknown tag {tag}")),
        }
        Ok(())
    }
}
