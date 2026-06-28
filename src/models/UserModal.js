import mongoose from 'mongoose'
import validator from 'validator'
import bcrypt from 'bcrypt'

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate(value) {
        if (!validator.isEmail(value)) {
          throw new Error("invalid email address" + value);
        }
      },
    },
    password: {
      type: String,
      // required: true HATA DIYA — ab function hai:
      required: function () {
        // sirf "local" (normal) users ke liye password required hai
        return this.authProvider === 'local'
      },
      select: false,
      validate(value) {
        // sirf tab validate karo jab password diya gaya ho
        // (Google users ke liye yeh skip ho jaayega)
        if (value && !validator.isStrongPassword(value)) {
          throw new Error("Enter a strong Password");
        }
      },
    },
    authProvider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    googleId: {
      type: String,
      default: null,
      // sparse: true zaroori hai — kyunki normal users
      // ke paas googleId nahi hoga (null), aur MongoDB
      // unique index pe multiple nulls allow nahi karta
      // sparse ke bina
      unique: true,
      sparse: true,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

UserSchema.pre("save", async function () {
  // password sirf tab hash karo jab woh exist kare
  // aur modify hua ho — Google users ke liye
  // password hi nahi hoga, toh yeh skip ho jaayega
  if (!this.isModified("password") || !this.password) return;
  this.password = await bcrypt.hash(this.password, 10);
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  // agar user ke paas password hi nahi hai (Google user),
  // toh comparison fail kar do — woh normal login
  // use nahi kar sakta
  if (!this.password) return false
  return await bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    authProvider: this.authProvider,
    createdAt: this.createdAt,
  };
};

const User = mongoose.model("User", UserSchema);
export default User