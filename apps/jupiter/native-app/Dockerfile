# Base stage with Node.js and Android SDK for building
FROM reactnativecommunity/react-native-android:latest AS builder
WORKDIR /app

# Copia el script helper al contenedor
COPY apps/mi-proyecto/copy-if-exists.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/copy-if-exists.sh

# Install dependencies
COPY package.json package-lock.json ./
COPY apps/jupiter/native-app/package.json ./apps/jupiter/native-app/
RUN mkdir -p ./libs/jupiter/shared/
RUN /usr/local/bin/copy-if-exists.sh libs/jupiter/shared/package.json ./libs/jupiter/shared/
RUN mkdir -p ./libs/jupiter/api-interfaces/
RUN /usr/local/bin/copy-if-exists.sh libs/jupiter/api-interfaces/package.json ./libs/jupiter/api-interfaces/

# Install dependencies (including dev dependencies needed for building)
RUN node -e "const fs=require('fs'); \
    const pkg=JSON.parse(fs.readFileSync('./package.json')); \
    if(pkg.dependencies && pkg.dependencies['haiku-generator']) delete pkg.dependencies['haiku-generator']; \
    if(pkg.devDependencies && pkg.devDependencies['haiku-generator']) delete pkg.devDependencies['haiku-generator']; \
    fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2));"
RUN npm install

# Copy source code
COPY tsconfig.base.json ./
COPY apps/jupiter/tsconfig.json ./apps/jupiter/
COPY apps/jupiter/native-app ./apps/jupiter/native-app/
RUN mkdir -p ./libs/jupiter/shared/
RUN /usr/local/bin/copy-if-exists.sh libs/jupiter/shared/* ./libs/jupiter/shared/
RUN mkdir -p ./libs/jupiter/api-interfaces/
RUN /usr/local/bin/copy-if-exists.sh libs/jupiter/api-interfaces/* ./libs/jupiter/api-interfaces/

# For CI/CD purposes - build the Android app
WORKDIR /app/apps/jupiter/native-app
RUN cd android && ./gradlew assembleRelease

# Outputs will be in /app/apps/jupiter/native-app/android/app/build/outputs/apk/release/app-release.apk
# You can use a storage stage to save this artifact for deployment

# Note: For iOS builds, you typically need to build on macOS outside of Docker
# This Dockerfile is primarily for CI testing and Android builds
