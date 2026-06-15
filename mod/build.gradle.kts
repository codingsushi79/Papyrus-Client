plugins {
    id("net.fabricmc.fabric-loom-remap") version "1.17.11"
    id("maven-publish")
    id("java")
}

version = property("mod_version") as String
group = property("maven_group") as String

base {
    archivesName.set(property("archives_base_name") as String)
}

repositories {
    mavenCentral()
    maven("https://maven.fabricmc.net/")
}

dependencies {
    minecraft("com.mojang:minecraft:${property("minecraft_version")}")
    mappings("net.fabricmc:yarn:${property("yarn_mappings")}:v2")
    modImplementation("net.fabricmc:fabric-loader:${property("loader_version")}")
    modImplementation("net.fabricmc.fabric-api:fabric-api:${property("fabric_version")}")
    implementation("com.google.code.gson:gson:2.11.0")
}

tasks.processResources {
    val props = mapOf(
        "version" to project.version,
        "minecraft_version" to project.property("minecraft_version"),
    )
    inputs.properties(props)
    filesMatching("fabric.mod.json") { expand(props) }
}

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

tasks.jar {
    val baseName = project.property("archives_base_name") as String
    val mcVersion = project.property("minecraft_version") as String
    archiveFileName.set("$baseName-$mcVersion-${project.version}.jar")
    from("LICENSE") {
        rename { "${it}_${base.archivesName.get()}" }
    }
}
