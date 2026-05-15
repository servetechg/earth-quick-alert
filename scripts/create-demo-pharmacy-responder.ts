/**
 * One-off: create or reset a local demo responder (pharmacy vertical).
 * Run: npx tsx scripts/create-demo-pharmacy-responder.ts
 * Requires MONGODB_URI in .env or .env.local
 */
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import connectDB from '../lib/mongodb'
import User from '../models/User'

dotenv.config({ path: '.env.development.local' })
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const DEMO_EMAIL = 'pharmacy.responder.demo@local.test'
const DEMO_PASSWORD = 'PharmacyResponderDemo2026!'
const DEMO_NAME = 'Demo Pharmacy Responder'

async function main() {
    await connectDB()

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, salt)

    const existing = await User.findOne({ email: DEMO_EMAIL })
    if (existing) {
        existing.password = hashedPassword
        existing.role = 'responder'
        existing.responderVertical = 'pharmacy'
        existing.responderFunction = 'County Rx resource deployment (demo)'
        existing.accountStatus = 'approved'
        await existing.save()
        console.log('Updated existing user:', DEMO_EMAIL)
    } else {
        await User.create({
            name: DEMO_NAME,
            email: DEMO_EMAIL,
            password: hashedPassword,
            role: 'responder',
            responderVertical: 'pharmacy',
            responderFunction: 'County Rx resource deployment (demo)',
            accountStatus: 'approved',
            licenseId: null,
        })
        console.log('Created user:', DEMO_EMAIL)
    }

    console.log('')
    console.log('--- Login (local) ---')
    console.log('Email:', DEMO_EMAIL)
    console.log('Password:', DEMO_PASSWORD)
    console.log('---------------------')
    console.log('Open http://localhost:3000/login and sign in; you will go to /responder-dashboard')
    console.log('Pharmacy sites & map: /responder-pharmacy-sites')

    await mongoose.disconnect()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
