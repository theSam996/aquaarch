require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(cors({
    origin: "http://127.0.0.1:3000",
    credentials: true
}));
app.use(express.static('.')); // Serve static files from root

// Initialize Supabase (Backend Client)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Serve Public Config
app.get('/api/config', (req, res) => {
    res.json({
        supabase: {
            url: process.env.SUPABASE_URL,
            key: process.env.SUPABASE_ANON_KEY
        },
        firebase: {
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID,
            measurementId: process.env.FIREBASE_MEASUREMENT_ID
        }
    });
});

// 1. Create Order API
app.post('/api/create-order', async (req, res) => {
    try {
        const { amount, currency, product_name, user_id, shipping_address, shoe_size, activity_level, email, phone, full_name } = req.body;

        // Create Razorpay Order
        const options = {
            amount: amount * 100, // Amount in paise
            currency: "INR",
            receipt: `receipt_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);

        // Insert into Supabase
        const { error } = await supabase
            .from('orders')
            .insert({
                user_id: user_id,
                product_name: product_name,
                amount: amount,
                currency: "INR",
                razorpay_order_id: order.id,
                payment_status: 'created',
                shipping_address: shipping_address,
                shoe_size: shoe_size,
                activity_level: activity_level
            });

        if (error) {
            console.error("Supabase Insert Error:", error);
            return res.status(500).json({ error: "Failed to save order" });
        }

        res.json({
            order_id: order.id,
            key_id: process.env.RAZORPAY_KEY_ID,
            amount: options.amount,
            currency: options.currency
        });

    } catch (error) {
        console.error("Create Order Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
});

// 2. Verify Payment API
app.post('/api/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        // Verify Signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            // Update Supabase
            const { error } = await supabase
                .from('orders')
                .update({
                    payment_status: 'paid',
                    razorpay_payment_id: razorpay_payment_id,
                    razorpay_signature: razorpay_signature
                })
                .eq('razorpay_order_id', razorpay_order_id);

            if (error) {
                console.error("Supabase Update Error:", error);
                return res.status(500).json({ error: "Payment verified but DB update failed" });
            }

            res.json({ status: "success", message: "Payment verified" });
        } else {
            // Update as Failed
            await supabase
                .from('orders')
                .update({ payment_status: 'failed' })
                .eq('razorpay_order_id', razorpay_order_id);

            res.status(400).json({ status: "failure", message: "Invalid Signature" });
        }

    } catch (error) {
        console.error("Verify Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
