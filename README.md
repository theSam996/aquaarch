# AquaArch - Sustainable Insoles

AquaArch is a web platform for 3D-printed sustainable insoles made from marine algae. This project allows users to explore products, perform 3D foot scans using their webcam, and manage their orders.

## Features

-   **Home Page**: Product showcase, features, and detailed "How It Works" section.
-   **3D Foot Scan**: Browser-based webcam integration to record foot scans for custom insole fitting.
-   **Dashboard**: Manage your 3D scans and view your cart.
-   **Shopping Cart**: Functional cart with local storage persistence.
-   **Orders**: Order tracking visualization.
-   **Authentication**: Integrated with Firebase (Google & Email Login).

## Tech Stack

-   **Frontend**: Vanilla HTML, CSS, JavaScript (No framework required).
-   **Styling**: Custom CSS with glassmorphism design and responsive utilities.
-   **Icons**: Lucide Icons.
-   **Authentication**: Firebase Auth (CDN).

## How to Run

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-username/aquaarch.git
    ```
2.  **Open the project**:
    -   Simply open `index.html` in your browser.
    -   **Recommendation**: Use a local development server (like "Live Server" in VS Code) for the 3D Scan camera features to work correctly (camera access usually requires `localhost` or `https`).

## Project Structure

-   `index.html` - Landing page.
-   `foot_scan.html` - 3D scanning interface.
-   `dashboard.html` - User dashboard (scans, cart).
-   `orders.html` - Order history and tracking.
-   `checkout.html` - Multi-step checkout form.
-   `script.js` - Application logic (Firebase auth, UI interactions, Camera).
-   `style.css` - Global styles and responsiveness.

## License

MIT License - Copyright (c) 2026 AquaArch
