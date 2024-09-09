import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.models.js";
import { uploadOnClouydinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler(async (req, res) => {
    const { fullName, userName, email, password } = req.body

    // Check validation i.e., empty validation
    if (
        [fullName, email, userName, password].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "All field is required !!")
    }

    // Check for existing user
    const existedUser = await User.findOne({
        $or: [{ userName }, { email }]
    })

    if (existedUser) {
        throw new ApiError(409, "User already existed with the given email or username.")
    }

    // Get the files path locally, with checks to avoid undefined errors
    const avatarLocalPath = req.files?.avatar?.[0]?.path;
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar is missing !!")
    }

    // file upload on cloudinary
    const avatar = await uploadOnClouydinary(avatarLocalPath)
    const coverImage = await uploadOnClouydinary(coverImageLocalPath)

    if (!avatar) {
        throw new ApiError(400, "Avatar is required !!")
    }

    // Create new user
    const user = await User.create({
        fullName,
        userName: userName.toLowerCase(),
        email,
        password,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
    })

    // check createdUser and removed password and refreshToken
    const createdUser = await User.findById(user._id).select(" -password -refreshtoken")

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully.")
    )
});

export { registerUser }