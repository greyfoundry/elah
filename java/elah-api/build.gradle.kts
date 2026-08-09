// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

plugins {
    `java-library`
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }

    sourceSets.main {
        java.srcDir("src/generated/java")
    }
}

dependencies {
    api("com.google.protobuf:protobuf-java:4.33.2")
    testImplementation(platform("org.junit:junit-bom:5.13.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.test {
    useJUnitPlatform()
}
