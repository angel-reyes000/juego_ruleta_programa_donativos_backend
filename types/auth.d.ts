// Payload que firma loginUser y que el middleware auth asigna a req.user.
export interface AuthUser {
    id: number
    name: string
    last_name: string
    role: string
    email: string
    phone_number: string
    created_at: string
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser
        }
    }
}
