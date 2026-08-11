// ╔══════════════════════════════════════════════════════════════════╗
// ║                                                                  ║
// ║                   ELAH | A GREYFOUNDRY PROJECT                   ║
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

use elah_observer::ErrorKind;

pub(crate) const SUCCESS: u8 = 0;
pub(crate) const USAGE: u8 = 2;
pub(crate) const UNSUPPORTED: u8 = 3;
pub(crate) const INVALID_OR_IO: u8 = 4;
pub(crate) const CHANGED: u8 = 5;

pub(crate) const fn for_error(kind: ErrorKind) -> u8 {
    match kind {
        ErrorKind::UnsupportedWorld => UNSUPPORTED,
        ErrorKind::UnsafeInput | ErrorKind::MalformedInput | ErrorKind::Io => INVALID_OR_IO,
        ErrorKind::Changed => CHANGED,
    }
}

#[cfg(test)]
mod tests {
    use super::{CHANGED, INVALID_OR_IO, UNSUPPORTED, for_error};
    use elah_observer::ErrorKind;

    #[test]
    fn typed_failures_have_stable_exit_codes() {
        assert_eq!(for_error(ErrorKind::UnsupportedWorld), UNSUPPORTED);
        assert_eq!(for_error(ErrorKind::UnsafeInput), INVALID_OR_IO);
        assert_eq!(for_error(ErrorKind::MalformedInput), INVALID_OR_IO);
        assert_eq!(for_error(ErrorKind::Io), INVALID_OR_IO);
        assert_eq!(for_error(ErrorKind::Changed), CHANGED);
    }
}
