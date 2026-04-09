plugins {
    java
}

group = "com.github.dcysteine.nesql.exporter.extension"
version = "2.0.0"

repositories {
    mavenCentral()
    maven("https://maven.minecraftforge.net/")
}

java {
    sourceCompatibility = JavaVersion.VERSION_1_8
    targetCompatibility = JavaVersion.VERSION_1_8
}

dependencies {
    // Only compile-time dependencies
    compileOnly("com.google.guava:guava:31.1-jre")
    compileOnly("com.google.code.gson:gson:2.10.1")
    compileOnly(fileTree("../nesql-exporter-main/build/libs") {
        include("*.jar")
    })
}

tasks.withType<Jar> {
    archiveFileName.set("NESQL-Exporter-Extension-${version}.jar")

    // Include only our new classes
    from(sourceSets.main.get().output) {
        include("com/github/dcysteine/nesql/exporter/local/**")
    }

    // Add manifest
    manifest {
        attributes(
            "Extension-Name" to "NESQL Exporter Extension",
            "Extension-Version" to version,
            "Description" to "Adds item list export and recipe index to NESQL Exporter"
        )
    }
}

// Copy the compiled classes to the main project
tasks.register("copyToMainProject") {
    dependsOn("build")
    doLast {
        val extensionJar = file("build/libs/NESQL-Exporter-Extension-${version}.jar")
        val targetDir = file("../nesql-exporter-main/build/libs")
        targetDir.mkdirs()
        copy {
            from(extensionJar)
            into(targetDir)
        }
        println("Extension JAR copied to: ${targetDir.absolutePath}/${extensionJar.name}")
    }
}
