import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

// Initialize App
export let auth;
let resolveAuth;
export const authInitialized = new Promise(resolve => resolveAuth = resolve);

async function initializeAppResult() {
    try {
        const response = await fetch('http://localhost:5001/api/config');
        const config = await response.json();

        // 1. Initialize Supabase
        if (window.supabase && window.supabase.createClient) {
            window.supabase = window.supabase.createClient(config.supabase.url, config.supabase.key);
            console.log("Supabase initialized");
        }

        // 2. Initialize Firebase
        const firebaseConfig = {
            apiKey: config.firebase.apiKey,
            authDomain: config.firebase.authDomain,
            projectId: config.firebase.projectId,
            storageBucket: config.firebase.storageBucket,
            messagingSenderId: config.firebase.messagingSenderId,
            appId: config.firebase.appId,
            measurementId: config.firebase.measurementId
        };

        const app = initializeApp(firebaseConfig);
        const analytics = getAnalytics(app);
        auth = getAuth(app);
        resolveAuth(auth); // Signal that auth is ready

        // Setup Auth Listeners after initialization
        setupAuthListeners();

    } catch (error) {
        console.error("Failed to load configuration:", error);
        alert("System Error: Could not connect to the backend server. Please ensure the server is running on port 5001.");
    }
}

// Start Initialization
initializeAppResult();

// Moved export to allow async init (handling in setupAuthListeners)
// export const auth = getAuth(app); // Cannot export async result directly in this structure easily regarding ES modules behavior in browser without top-level await support in all contexts.
// Modified structure to handle auth globally.

function setupAuthListeners() {
    // UI Logic that depends on Auth
    onAuthStateChanged(auth, (user) => {
        const authLinks = document.querySelectorAll('.auth-link');
        const userLinks = document.querySelectorAll('.user-link');

        if (user) {
            authLinks.forEach(el => el.style.display = 'none');
            userLinks.forEach(el => el.style.display = 'flex');

            // Update personalized texts if any
            const userNameElements = document.querySelectorAll('.user-name-display');
            userNameElements.forEach(el => {
                el.innerText = user.displayName || user.email;
            });

            // Trigger data fetch if we are on dashboard
            if (window.location.pathname.includes('dashboard') && window.fetchScans) {
                window.fetchScans();
            }
            if (window.location.pathname.includes('orders') && window.fetchOrders) {
                window.fetchOrders();
            }

        } else {
            authLinks.forEach(el => el.style.display = 'flex');
            userLinks.forEach(el => el.style.display = 'none');

            // Redirect if on protected page
            const path = window.location.pathname;
            if (path.includes('dashboard') || path.includes('orders') || path.includes('checkout') || path.includes('foot_scan')) {
                window.location.href = 'login.html';
            }
        }
    });
}

// Global function for Buy Now
window.buyProduct = (name, price) => {
    // Check if user is logged in
    const user = auth.currentUser;
    sessionStorage.setItem('selectedProduct', name);
    sessionStorage.setItem('selectedPrice', price);

    // Add to cart in localStorage
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    cart.push({ name, price });
    localStorage.setItem('cart', JSON.stringify(cart));

    if (user) {
        window.location.href = 'dashboard.html'; // Redirect to dashboard to see cart
    } else {
        alert("Please log in to purchase.");
        window.location.href = 'login.html';
    }
};

// Global function for Add to Cart
window.addToCart = (name, price) => {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    cart.push({ name, price });
    localStorage.setItem('cart', JSON.stringify(cart));
    alert(`${name} added to cart!`);
};

window.removeFromCart = (index) => {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    cart.splice(index, 1);
    localStorage.setItem('cart', JSON.stringify(cart));
    location.reload();
}

// UI Logic
document.addEventListener('DOMContentLoaded', () => {
    // Scroll Animation
    const reveals = document.querySelectorAll('.reveal');

    const checkScroll = () => {
        const windowHeight = window.innerHeight;
        const elementVisible = 150;

        reveals.forEach(reveal => {
            const elementTop = reveal.getBoundingClientRect().top;
            if (elementTop < windowHeight - elementVisible) {
                reveal.classList.add('active');
            }
        });
    };

    window.addEventListener('scroll', checkScroll);
    checkScroll(); // Check on load

    // Navbar Scroll Effect
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 20) {
                navbar.classList.add('navbar-scrolled');
            } else {
                navbar.classList.remove('navbar-scrolled');
            }
        });
    }

    // Mobile Menu Toggle
    const mobileToggle = document.querySelector('.mobile-toggle');
    const mobileMenu = document.querySelector('.mobile-menu');
    const closeMenuLinks = document.querySelectorAll('.mobile-menu a');

    if (mobileToggle && mobileMenu) {
        mobileToggle.addEventListener('click', () => {
            mobileMenu.classList.toggle('open');
        });

        closeMenuLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.remove('open');
            });
        });
    }

    // Auth State Observer logic moved to setupAuthListeners() to avoid race conditions

    // Logout Handler
    const logoutButtons = document.querySelectorAll('.logout-btn');
    logoutButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                window.location.href = 'login.html';
            } catch (error) {
                console.error("Logout failed", error);
            }
        });
    });

    // --- Supabase Logic ---

    // 0. Delete Scan
    window.deleteScan = async (id, videoPath) => {
        if (!confirm("Are you sure you want to delete this scan? This cannot be undone.")) return;

        try {
            console.log(`Attempting to delete scan ${id} at path ${videoPath}`);

            // A. Delete from Storage
            const { error: storageError } = await window.supabase
                .storage
                .from('foot_scans')
                .remove([videoPath]);

            if (storageError) {
                console.warn("Storage delete warning:", storageError);
            }

            // B. Delete from Database
            const { data, error: dbError } = await window.supabase
                .from('scans')
                .delete()
                .eq('id', id)
                .select();

            if (dbError) throw dbError;

            if (!data || data.length === 0) {
                console.warn("No rows deleted. Check RLS policies.");
                alert("Could not delete scan. RLS Policy interaction.");
                // return; // Soft fail, refresh anyway
            }

            alert("Scan deleted successfully.");
            window.fetchScans(); // Refresh list

        } catch (error) {
            console.error("Delete failed:", error);
            alert("Failed to delete scan: " + error.message);
        }
    }

    // 1. Upload Scan
    window.uploadScan = async (file) => {
        const user = auth.currentUser;
        if (!user) return;

        try {
            const fileName = `scan_${user.uid}_${Date.now()}.webm`;
            const { data, error } = await window.supabase.storage
                .from('foot_scans')
                .upload(fileName, file);

            if (error) throw error;

            // Get Public URL
            const { data: { publicUrl } } = window.supabase.storage
                .from('foot_scans')
                .getPublicUrl(fileName);

            // Save to DB (Schema: id, user_id, video_path, created_at)
            const { error: dbError } = await window.supabase
                .from('scans')
                .insert({
                    user_id: user.uid,
                    video_path: fileName,
                    created_at: new Date()
                });

            if (dbError) throw dbError;

            alert("Scan uploaded successfully!");
            if (window.fetchScans) window.fetchScans();

        } catch (error) {
            console.error("Upload failed", error);
            alert("Upload failed: " + error.message);
        }
    };

    // 2. Fetch Scans
    window.fetchScans = async () => {
        console.log("Starting fetchScans...");
        const scansContainer = document.getElementById('scans-container');
        if (!scansContainer) return;

        try {
            if (!window.supabase) {
                throw new Error("Supabase client not initialized");
            }

            const user = auth.currentUser;
            if (!user) {
                console.warn("No user found in fetchScans");
                return;
            }

            const { data, error } = await window.supabase
                .from('scans')
                .select('*')
                .eq('user_id', user.uid)
                .order('created_at', { ascending: false });

            if (error) throw error;

            console.log("Scans fetched:", data?.length);

            if (!data || data.length === 0) {
                scansContainer.innerHTML = '<p style="color: #aaa;">No scans found. Start a new scan!</p>';
            } else {
                let html = '';
                // Use for...of to allow await inside the loop
                for (const scan of data) {
                    const date = new Date(scan.created_at).toLocaleDateString();
                    const fileName = scan.video_path.split('_').pop();

                    // Generate Signed URL dynamically (valid for 1 hour)
                    const { data: signedUrlData, error: signError } = await window.supabase.storage
                        .from('foot_scans')
                        .createSignedUrl(scan.video_path, 3600);

                    if (signError) console.error("Error signing URL:", signError);
                    const videoUrl = signedUrlData ? signedUrlData.signedUrl : "";

                    html += `
                        <div class="scan-card" style="background: rgba(74, 222, 128, 0.1); padding: 1.5rem; border-radius: 1rem; border: 1px solid var(--accent-primary); margin-top: 1rem;">
                            <div class="flex items-center gap-4 mb-4">
                                <i data-lucide="file-video" style="color: var(--accent-primary); flex-shrink: 0;" width="32"></i>
                                <div style="flex-grow: 1; min-width: 0;">
                                    <h4 class="text-truncate" title="${fileName}">${fileName}</h4>
                                    <p style="font-size:0.8rem; color: #aaa; margin:0;">Uploaded on ${date}</p>
                                </div>
                                <button onclick="deleteScan('${scan.id}', '${scan.video_path}')" title="Delete Scan" class="btn-icon-danger">
                                     <i data-lucide="trash-2" width="18"></i>
                                </button>
                            </div>

                            <video controls style="width:100%; border-radius:0.5rem; margin-bottom:1rem; background:black;">
                                <source src="${videoUrl}" type="video/webm">
                                <source src="${videoUrl}" type="video/mp4">
                                Your browser does not support the video tag.
                            </video>
                        </div>
                    `;
                }

                scansContainer.innerHTML = html;
                lucide.createIcons();
            }
        } catch (error) {
            console.error("Error in fetchScans:", error);
            scansContainer.innerHTML = '<p style="color:red">Failed to load scans. ' + error.message + '</p>';
        }
    };

    // --- Camera Logic ---
    const startCameraBtn = document.getElementById('start-camera-btn');
    const stopCameraBtn = document.getElementById('stop-camera-btn');
    const videoPreview = document.getElementById('video-feed'); // Correct ID for <video>
    const placeholderUI = document.getElementById('camera-placeholder-ui');
    const videoUpload = document.getElementById('video-upload');
    const uploadStatus = document.getElementById('upload-status');
    let mediaRecorder;
    let chunks = [];

    if (startCameraBtn && videoPreview) {
        startCameraBtn.addEventListener('click', async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                videoPreview.srcObject = stream;

                // Toggle UI
                videoPreview.style.display = 'block';
                if (placeholderUI) placeholderUI.style.display = 'none';

                startCameraBtn.style.display = 'none';
                stopCameraBtn.style.display = 'inline-block';

                mediaRecorder = new MediaRecorder(stream);

                mediaRecorder.ondataavailable = (e) => {
                    chunks.push(e.data);
                };

                mediaRecorder.onstop = async () => {
                    const blob = new Blob(chunks, { 'type': 'video/webm' });
                    chunks = [];
                    const file = new File([blob], "camera_scan.webm", { type: "video/webm" });

                    // Stop stream tracks
                    stream.getTracks().forEach(track => track.stop());

                    // Reset UI
                    videoPreview.style.display = 'none';
                    if (placeholderUI) placeholderUI.style.display = 'flex';

                    if (confirm("Scan recorded! Do you want to upload it?")) {
                        if (uploadStatus) uploadStatus.innerText = "Uploading...";
                        await window.uploadScan(file);
                        if (uploadStatus) uploadStatus.innerText = "Upload Complete";
                    }

                    startCameraBtn.style.display = 'inline-block';
                    startCameraBtn.innerText = 'Record Again';
                    stopCameraBtn.style.display = 'none';
                };

                mediaRecorder.start();

            } catch (err) {
                console.error("Camera Error:", err);
                alert("Could not access camera. Please allow permissions.");
            }
        });

        if (stopCameraBtn) {
            stopCameraBtn.addEventListener('click', () => {
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }
            });
        }
    }

    if (videoUpload && uploadStatus) {
        videoUpload.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                uploadStatus.innerText = `Uploading ${file.name}...`;
                await window.uploadScan(file);
                uploadStatus.innerText = "Upload Complete";
            }
        });
    }

    // --- Dashboard Page Logic ---
    const scansSection = document.getElementById('scans-container');
    const cartSection = document.getElementById('cart-container');

    if (cartSection) {
        const cart = JSON.parse(localStorage.getItem('cart') || '[]');
        if (cart.length > 0) {
            let html = '<div class="flex flex-col gap-4">';
            let total = 0;

            cart.forEach((item, index) => {
                const priceNum = parseInt(item.price.replace(/[^\d]/g, ''));
                total += priceNum;

                html += `
                    <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h4 style="margin:0; font-size: 1rem;">${item.name}</h4>
                            <p style="margin:0; font-size: 0.85rem; color: #aaa;">${item.price}</p>
                        </div>
                        <button onclick="removeFromCart(${index})" style="background:none; border:none; color: #EF4444; cursor: pointer;">
                            <i data-lucide="trash-2" width="18"></i>
                        </button>
                    </div>
                `;
            });

            html += `</div>
                <div style="margin-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: bold; font-size: 1.1rem;">Total:</span>
                    <span style="font-weight: bold; color: var(--accent-primary); font-size: 1.1rem;">₹${total}</span>
                </div>
                <button onclick="window.location.href='checkout.html'" class="btn btn-primary w-full" style="margin-top: 1.5rem;">Checkout</button>
            `;
            cartSection.innerHTML = html;
        } else {
            cartSection.innerHTML = '<p style="color: #aaa;">Your cart is empty.</p>';
        }
        lucide.createIcons();
    }

    // --- Checkout Logic (Razorpay) ---
    window.confirmOrder = async (e) => {
        if (e) e.preventDefault();

        const user = auth.currentUser;
        if (!user) {
            alert("Please log in to purchase.");
            window.location.href = 'login.html';
            return;
        }

        const confirmBtn = document.querySelector('button[type="submit"]');
        if (confirmBtn) confirmBtn.innerText = "Processing...";

        // Logic: specific 'Buy Now' product (sessionStorage) vs Cart (localStorage)
        // Since 'Buy Now' adds to cart, we should check Cart first.
        const cart = JSON.parse(localStorage.getItem('cart') || '[]');
        let numericPrice = 0;
        let storedProduct = "Custom Insoles";

        if (cart.length > 0) {
            // Calculate Total from Cart
            numericPrice = cart.reduce((total, item) => {
                return total + parseInt(item.price.replace(/[^\d]/g, ''));
            }, 0);
            storedProduct = `Order of ${cart.length} items (${cart[0].name}...)`;
        } else {
            // Fallback for single product buy legacy or empty cart
            const storedPrice = sessionStorage.getItem('selectedPrice') || "2999";
            numericPrice = parseInt(storedPrice.replace(/[^\d]/g, ''));
            storedProduct = sessionStorage.getItem('selectedProduct') || "Custom Insoles";
        }

        const address = document.getElementById('address')?.value || "Not Provided";
        const shoeSize = document.getElementById('shoe-size')?.value || "Not Provided";
        const activity = document.getElementById('activity')?.value || "General";

        const orderData = {
            amount: numericPrice,
            currency: "INR",
            product_name: storedProduct,
            user_id: user.uid,
            shipping_address: address,
            shoe_size: shoeSize,
            activity_level: activity,
            email: user.email,
            phone: "9999999999",
            full_name: user.displayName || "Valued Customer"
        };

        try {
            // 2. Call Backend to Create Order (Port 5001)
            const response = await fetch('http://localhost:5001/api/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Order creation failed");

            // 3. Open Razorpay Checkout
            const options = {
                "key": data.key_id,
                "amount": data.amount,
                "currency": data.currency,
                "name": "AquaArch",
                "description": `Payment for ${storedProduct}`,
                "order_id": data.order_id,
                "handler": async function (response) {
                    // 4. Verify Payment on Success (Port 5001)
                    try {
                        const verifyRes = await fetch('http://localhost:5001/api/verify-payment', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature
                            })
                        });

                        const verifyData = await verifyRes.json();
                        if (verifyRes.ok) {
                            alert("Payment Successful! Order ID: " + data.order_id);
                            sessionStorage.removeItem('selectedProduct');
                            sessionStorage.removeItem('selectedPrice');
                            localStorage.removeItem('cart'); // Clear cart too
                            window.location.href = 'orders.html';
                        } else {
                            alert("Payment Verification Failed: " + verifyData.message);
                        }
                    } catch (err) {
                        console.error("Verification Error", err);
                        alert("Payment verified locally but server update failed. Please contact support.");
                    }
                },
                "prefill": {
                    "name": user.displayName,
                    "email": user.email,
                    "contact": ""
                },
                "theme": {
                    "color": "#4ADE80"
                }
            };

            const rzp1 = new Razorpay(options);
            rzp1.on('payment.failed', function (response) {
                alert("Payment Failed: " + response.error.description);
            });
            rzp1.open();

        } catch (error) {
            console.error("Payment Start Error:", error);
            alert("Could not start payment: " + error.message);
        } finally {
            if (confirmBtn) confirmBtn.innerText = "Confirm Order";
        }
    };

    // --- Orders Page Logic ---
    window.fetchOrders = async () => {
        const ordersContainer = document.querySelector('.orders-container');
        if (!ordersContainer) return;

        const user = auth.currentUser;
        if (!user) return;

        try {
            const { data: orders, error } = await window.supabase
                .from('orders')
                .select('*')
                .eq('user_id', user.uid)
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!orders || orders.length === 0) {
                ordersContainer.innerHTML = `
                    <h1 class="section-title mb-8">Your <span class="accent-text">Orders</span></h1>
                    <p class="text-center" style="color: #aaa;">You haven't placed any orders yet.</p>
                    <div class="text-center mt-4">
                        <a href="index.html#products" class="btn btn-primary">Browse Products</a>
                    </div>
                 `;
                return;
            }

            let html = `<h1 class="section-title mb-8">Your <span class="accent-text">Orders</span></h1><div class="flex flex-col gap-6">`;

            orders.forEach((order, index) => {
                const date = new Date(order.created_at).toLocaleDateString();
                const statusColor = order.payment_status === 'paid' ? '#4ADE80' :
                    order.payment_status === 'failed' ? '#EF4444' : '#FBBF24';

                const statusIcon = order.payment_status === 'paid' ? 'check-circle' :
                    order.payment_status === 'failed' ? 'x-circle' : 'clock';

                html += `
                    <div class="order-card" style="animation-delay: ${index * 100}ms">
                        <div class="order-card-header">
                            <div>
                                <h3 class="order-title">${order.product_name}</h3>
                                <p class="order-date">Placed on ${date}</p>
                            </div>
                             <div style="display:flex; align-items:center; gap:0.5rem; color: ${statusColor}; font-weight:500;">
                                <i data-lucide="${statusIcon}" width="18"></i>
                                <span style="text-transform: capitalize;">${order.payment_status}</span>
                            </div>
                        </div>
                        
                        <div style="margin-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1rem; display: flex; justify-content: space-between;">
                            <div>
                                <p style="margin:0; font-size: 0.9rem; color: #aaa;">Amount</p>
                                <p style="margin:0; font-weight: bold;">₹${order.amount}</p>
                            </div>
                             <div>
                                <p style="margin:0; font-size: 0.9rem; color: #aaa;">Order ID</p>
                                <p style="margin:0; font-family: monospace;">${order.razorpay_order_id || 'N/A'}</p>
                            </div>
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
            ordersContainer.innerHTML = html;
            lucide.createIcons();

        } catch (error) {
            console.error("Error fetching orders:", error);
            ordersContainer.innerHTML += '<p style="color: red; text-align: center;">Failed to load orders.</p>';
        }
    };
});
