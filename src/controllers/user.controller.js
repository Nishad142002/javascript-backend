import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import { User } from './../models/user.model.js';
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import  jwt  from 'jsonwebtoken';



const generateAccessAndRefreshTokens = async(userId) => {

  try {
    const user = await User.findById(userId)
    const accessToken = user.generateAccessToken()
    const refreshToken = user.generateRefreshToken()

    user.refreshToken = refreshToken
    await user.save({validateBeforeSave: false})
    
    return {accessToken, refreshToken}

  } catch (error) {
    throw new ApiError(500, "Somthing went wrong while generating refresh and access token")
  }

}


const registerUser = asyncHandler( async(req, res) => {

  // ** get user details from frontend **
  const { fullname, email, username, password } = req.body
  
  // ** validation **
  /*
  if (fullname === "") {
    throw new ApiError(400, "Full Name is Required")
  }*/
  if ([fullname, email, username, password].some((field) => field?.trim() === "")) 
  {
    throw new ApiError(400, "All fields are required")
  }

  // ** check if user already exists : username, email **
  const existedUser = await User.findOne({
    $or: [ { username }, { email } ]
  })

  if(existedUser) {
    throw new ApiError(409, "User with username or email already exists")
  }
  
  // ** check for images, check for avtar **
  const avtarLocalPath = req.files?.avatar[0]?.path;
  //const coverImageLocalPath = req.files?.coverImage[0]?.path;

  let coverImageLocalPath;
  if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
    coverImageLocalPath = req.files.coverImage[0].path
  }

  if (!avtarLocalPath) {
    throw new ApiError(400, "Avatar file is required 1")
  }

  // ** upload them to cloudinary **
  const avatar = await uploadOnCloudinary(avtarLocalPath)
  const coverImage = await uploadOnCloudinary(coverImageLocalPath)

  if (!avatar) {
    throw new ApiError(400, "Avatar file is required 2")
  }

  // ** create user object - create entry in db **
  const user = await User.create({
    fullname,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase()
  })

  // ** remove password and refresh token field from response **
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  )

  // ** check for user creation **
  if(!createdUser) {
    throw new ApiError(500, "Smothing went wrong while registring the user")
  }

  // ** return response **
  return res.status(201).json(
    new ApiResponse(200, createdUser, "User registered Successfully")
  )

})




// ** Login code logic

const loginUser = asyncHandler(async (req, res) => {
  // req body -> data
  const {email, username, password} = req.body;

  // username or email
  if(!username && !email){
    throw new ApiError(400, "Username or Email is required")
  }

  // find the user
  const user = await User.findOne({
    $or: [{username}, {email}]
  })

  if (!user) {
    throw new ApiError(404, "User not found")
  }
  
  // password check
  const isPasswordValid = await user.isPasswordCorrect(password)

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid Password")
  }

  // access and refresh token
  const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

  const loggedInUsesr = await User.findById(user._id).select("-password -refreshToken")

  // send these token in cookie
  const options = {
    httpOnly: true,
    secure: true
  }

  return res.status(200)
  .cookie("accessToken", accessToken, options)
  .cookie("refreshToken", refreshToken, options)
  .json(
    new ApiResponse(
      200,
      {
        user: loggedInUsesr, accessToken, refreshToken
      },
      "User logged In Successfully"
    )
  )
})


// Logged out Logic

const logoutUser = asyncHandler(async(req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined
      }
    },
    {
      new: true
    }
  )

  const options = {
    httpOnly: true,
    secure: true
  }

  return res.status(200)
  .clearCookie("accessToken", options)
  .clearCookie("refreshToken", options)
  .json(new ApiResponse(200, {}, "User logged Out"))
})


// refresh token 
const refreshAccessToke = asyncHandler(async (req, res) => {
  
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {

    const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
  
    const user = await User.findById(decodedToken?._id)
  
    if (!user) {
      throw new ApiError(401, "Invallid refresh token");
    }
  
    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used")
    }
  
    const {accessToken, newrefreshToken} = await generateAccessAndRefreshTokens(user._id)
  
    const options = {
      httpOnly: true,
      secure: true
    }
  
    return res.status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", newrefreshToken, options)
    .json(
      new ApiResponse(
        200, 
        {accessToken, refreshToken: newrefreshToken},
        "Access token refreshed"
      )
    )

  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid Access Token")
  }

})


// change current password
const changeCurrentPassword = asyncHandler(async (req, res) => {
  const {oldPassword, newPassword} = req.body

  const user = await User.findById(req.user?._id)

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old passowrd")
  }

  user.password = newPassword
  await user.save({validateBeforeSave: false})

  return res.status(200)
  .json(new ApiResponse(200, {}, "Password change successfully"))
})


// get current user
const getCurrentUser = asyncHandler(async (req, res) => {
  return res.status(200)
  .json(200, req.user, "current user fetched successfully")
})


// user account updated
const updateAccountDetails = asyncHandler(async (req, res) => {
  const {fullname, email, username} = req.body

  if (!fullname || !email) {
    throw new ApiError(400, "all field required")
  }

  const user = User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullname,
        email,
        username
      }
    },
    {new: true}

  ).select("-password -refreshToken")

  return res.status(200)
  .json(new ApiResponse(200, user, "Account details update successfully"))

})


// update files
const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing")
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath)

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading on avatar")
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url
      }
    },
    {new: true}
  ).select("-password")

  return res.status(200)
  .json(
    new ApiResponse(200, user, "Avatar updated successfully")
  )

})


const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Avatar file is missing")
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath)

  if (!coverImage.url) {
    throw new ApiError(400, "Error while uploading on avatar")
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url
      }
    },
    {new: true}
  ).select("-password")

  return res.status(200)
  .json(
    new ApiResponse(200, user, "Cover Image updated successfully")
  )

})


export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToke,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage
}