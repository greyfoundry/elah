// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

use elah_core::ComponentIdentity;

#[test]
fn component_identity_has_the_requested_name_and_workspace_version() {
    let identity = ComponentIdentity::new("elah-core").expect("a non-empty name is valid");

    assert_eq!(identity.name(), "elah-core");
    assert_eq!(identity.version(), "0.0.1");
}

#[test]
fn component_identity_rejects_a_blank_name() {
    assert!(ComponentIdentity::new("   ").is_err());
}
