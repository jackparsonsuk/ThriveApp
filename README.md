# ThriveApp

Welcome to **ThriveApp**, a comprehensive cross-platform application tailored for managing personal training sessions and recurring client bookings. 

Built on top of [Expo](https://expo.dev/) (React Native) and [Firebase](https://firebase.google.com/), this application empowers Personal Trainers (PTs) and clients by offering a reliable and dynamic interface to manage schedules, track sessions, and handle booking functionality across Web, iOS, and Android.

## Features

- **Cross-Platform**: Runs seamlessly on the web, iOS, and Android using a single React Native codebase.
- **Expo Router**: Utilizes modern file-based routing to manage navigation smoothly (`app/(tabs)`).
- **Backend as a Service (BaaS)**: Fully integrated with **Firebase** for cloud data synchronization.
- **PT Session Management**: Dedicated workflows for setting up recurring PT sessions and managing client bookings.
- **Cloud Functions**: Robust backend logic via Firebase Cloud Functions (e.g., generating future recurring bookings automatically).
- **Authentication & Security**: Secure user access and Firestore Rules to protect client data.

## Getting Started

Follow the instructions below to get the development environment running on your local machine.

### Prerequisites

- [Node.js](https://nodejs.org/en/) (v18 or above recommended)
- `npm` or `yarn`
- [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`)
- An [Expo account](https://expo.dev/) (optional, for cloud services like EAS Build)

### 1. Install Dependencies

Clone this repository and open the inner app directory (`thriveapp/`) to install the core project dependencies:
```bash
cd thriveapp
npm install
```

You'll also need to install dependencies for the Firebase Cloud Functions:
```bash
cd functions
npm install
```

### 2. Environment Configuration

If you're deploying this application yourself, you need to create a `.env` file at the root of the app project (`thriveapp/.env`) with your Firebase configuration.

```env
EXPO_PUBLIC_FIREBASE_API_KEY="..."
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN="..."
EXPO_PUBLIC_FIREBASE_PROJECT_ID="..."
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET="..."
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="..."
EXPO_PUBLIC_FIREBASE_APP_ID="..."
```
*(Ensure you do not commit your API keys publicly!)*

### 3. Run Firebase Emulators

During local development, it is highly recommended to use the Firebase Emulators to mock the database and cloud functions.

Open a terminal in the `thriveapp` directory and run:
```bash
npx firebase-tools emulators:start
```
*(You may use `--only functions` if you only want to mock Cloud Functions.)*

### 4. Start the Application

In a separate terminal, within the `thriveapp` directory, start the Expo development server:

```bash
npm start
```

This will launch the Metro Bundler. From here, you can:
- Press `a` to open the app on an **Android emulator**.
- Press `i` to open the app on an **iOS simulator**.
- Press `w` to open the app in a **Web browser**.
- Scan the QR code using the **Expo Go** app on your physical mobile device.

## Project Structure

```text
ThriveApp/
└── thriveapp/            # The core cross-platform application
    ├── app/              # Expo Router views and layouts
    ├── assets/           # Static assets (images, fonts, splash screen)
    ├── components/       # Reusable UI components
    ├── constants/        # Global constants (colors, theme configurations)
    ├── context/          # React Context providers (Auth, Theme, etc.)
    ├── functions/        # Firebase Cloud Functions (Node.js backend)
    ├── hooks/            # Custom React hooks
    ├── scripts/          # Helper development scripts
    ├── services/         # API services and Firebase integrations (Firestore, Auth)
    ├── utils/            # Utility methods and helper functions
    ├── firebase.json     # Firebase project configuration
    ├── firestore.rules   # Security rules for Cloud Firestore
    ├── app.json          # Expo application configuration
    └── package.json      # Dependency and script definitions
```

## Deployment

### Web Deployment

This project's web output supports static rendering. It is structured to deploy smoothly using services like Vercel or Firebase Hosting.

### Mobile Deployment (EAS Build)

To build the project for iOS and Android, utilize [EAS (Expo Application Services)](https://docs.expo.dev/build/introduction/):

1. Install EAS CLI: `npm install -g eas-cli`
2. Log in: `eas login`
3. Configure the project: `eas build:configure`
4. Run a build: `eas build --profile production`

## Learn More

To learn more about developing your project with Expo, look at the following resources:
- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with guides.
- [React Native Directory](https://reactnative.directory/): Discover the broader ecosystem of packages.
- [Firebase Documentation](https://firebase.google.com/docs): Understand how to utilize Cloud Firestore, Functions, and triggers.

---
*Created for Thrive Collective.*
