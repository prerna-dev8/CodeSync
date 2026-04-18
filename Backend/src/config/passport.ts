import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import User from "../models/User";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      callbackURL: process.env.GOOGLE_CALLBACK_URL as string,
    },
    async (_accessToken, _refreshToken, profile: Profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error("No email from Google"), undefined);

          // Check if account already exists with same email (merge)
          user = await User.findOne({ email });
          if (user) {
            user.googleId = profile.id;
            if (!user.avatar) user.avatar = profile.photos?.[0]?.value ?? "";
            user.isVerified = true;
            await user.save();
          } else {
            user = await User.create({
              googleId: profile.id,
              email,
              username: profile.displayName.replace(/\s+/g, "_").toLowerCase(),
              avatar: profile.photos?.[0]?.value ?? "",
              isVerified: true, // Google already verified the email
            });
          }
        }

        return done(null, user);
      } catch (err) {
        return done(err as Error, undefined);
      }
    }
  )
);

export default passport;
