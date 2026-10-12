plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ir.hirmand.staff"
    compileSdk = 35

    defaultConfig {
        applicationId = "ir.hirmand.staff"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "0.5.0"
        buildConfigField(
            "String",
            "STAFF_DIRECTORY_URL",
            "\"https://www.hirmandrealestate.ir/api/mobile/staff-directory\""
        )
        buildConfigField(
            "String",
            "STAFF_DEVICE_REGISTER_URL",
            "\"https://www.hirmandrealestate.ir/api/mobile/staff-device\""
        )
        buildConfigField(
            "String",
            "STAFF_TELEMETRY_URL",
            "\"https://www.hirmandrealestate.ir/api/mobile/telemetry\""
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    buildFeatures {
        buildConfig = true
    }


    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.10.0")
    implementation("androidx.work:work-runtime-ktx:2.12.0")
    implementation("com.google.android.material:material:1.12.0")
}
