# UniMatch Architecture Decision

## High-Level Architecture

```text
+------------------------+      +------------------------+
|                        |      |                        |
|   Expo Mobile App      | <--> |   Render Backend API   |
|   (React Native)       |      |   (Business Logic)     |
|                        |      |                        |
+-----------^------------+      +-----------^------------+
            |                               |
            |           +-------------------+
            |           |
+-----------v-----------v------------+
|                                    |
|            Supabase                |
|   (Auth, Postgres, Realtime)       |
|                                    |
+------------------------------------+
```

## Responsibilities

### 1. Expo Mobile App (Frontend)
- **UI/UX:** Responsible for all screens, navigation, and user interactions.
- **Client Logic:** Handling forms, local state management, and user input validation.
- **API Interaction:** Communicating with the Render backend API for business logic and Supabase for data synchronization.
- **RTL Support:** Ensuring full Hebrew RTL layout and localized experience.

### 2. Render Backend API (Business Logic Layer)
- **Matching Algorithm:** Core logic for finding the "one best match" based on user profiles and questionnaire data.
- **Business Rules:** 
    - Enforcing the monthly limit of 5 matches per user.
    - Handling 72-hour match expiration logic.
- **Background Jobs:** Running nightly jobs for matching and data maintenance.
- **Future Enhancements:** AI matching integration and complex notification/email rules.

### 3. Supabase (Data & Infrastructure)
- **Authentication:** Handling user signup, login, and secure sessions.
- **PostgreSQL Database:** Storing all application data (profiles, questionnaire answers, matches, chats, messages).
- **Row-Level Security (RLS):** Ensuring data privacy and security at the database level.
- **Realtime:** Providing support for realtime chat functionality.
- **Storage:** Handling images and file uploads in the future.

## Important Principles
- **Separation of Concerns:** The mobile app should not contain the core matching algorithm. It requests matches from the backend.
- **Data Flow:** The backend interacts with Supabase to read and write data, while the app consumes data through the backend or directly from Supabase where appropriate (e.g., auth, basic profile data).

## Development Roadmap
1. **Frontend MVP:** Current state - focus on UI and flow (Hebrew/RTL).
2. **Supabase Project Setup:** Initializing the database and auth environment.
3. **Supabase Auth:** Implementing user authentication.
4. **Data Modeling:** Creating `profiles`, `questionnaire_answers`, `matches`, and `chats`/`messages` tables.
5. **Backend API:** Building the initial custom backend for matching logic.
6. **Deployment:** Deploying the backend to Render.
7. **Advanced Features:** Adding nightly jobs, AI matching, and enhanced notifications.

> **Note:** Render is not needed until there is backend code to deploy. Supabase should be created first because the backend needs data to work with.
