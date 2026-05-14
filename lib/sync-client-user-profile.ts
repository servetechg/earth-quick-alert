/** Dispatched after localStorage user fields are updated so Header and layouts can refresh. */
export const USER_PROFILE_UPDATED_EVENT = 'earthquick:userProfileUpdated' as const

/** Keeps client session fields in sync with server profile (name, email, photo, location). */
export function syncClientUserProfileFromServer(user: {
  name?: string | null
  email?: string | null
  location?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  profilePic?: string | null
}) {
  if (typeof window === 'undefined') return
  if (user.name != null) localStorage.setItem('userName', String(user.name))
  if (user.email != null) localStorage.setItem('userEmail', String(user.email))
  if (user.location != null) localStorage.setItem('userLocation', String(user.location))
  if (user.city != null) localStorage.setItem('userCity', String(user.city))
  if (user.state != null) localStorage.setItem('userState', String(user.state))
  if (user.country != null) localStorage.setItem('userCountry', String(user.country))
  if (user.profilePic != null) localStorage.setItem('userProfilePic', String(user.profilePic))
  window.dispatchEvent(new Event(USER_PROFILE_UPDATED_EVENT))
}
