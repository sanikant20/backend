import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { Video } from "../models/video.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"

// controller to publish video
const publishVideo = asyncHandler(async (req, res) => {
    const {_id: userId} = req.user
    if (!userId) {
        throw new ApiError(400, "Unauthorized, user is not login.")
    }

    const { title, description } = req.body
    // check empty validation
    if (!title && !description) {
        throw new ApiError(400, "Either title or description is required.")
    }

    // Check for existing title
    const existedVideoTitle = await Video.findOne({
        $or: [{ title }]
    })
    if (existedVideoTitle) {
        throw new ApiError(409, "Video title already exists, please write new title !!")
    }

    // Get the files path locally, with checks to avoid undefined errors
    const localVideoFile = await req.files?.videoFile?.[0].path;
    const localThumbnailFile = await req.files?.thumbnail?.[0].path;

    if (!localVideoFile) {
        throw new ApiError(400, "Video is missing !!")
    }
    if (!localThumbnailFile) {
        throw new ApiError(400, "Thumbanil is missing !!")
    }

    // file upload on cloudinary
    const cloudVideoFile = await uploadOnCloudinary(localVideoFile)
    const cloudThumbnailFile = await uploadOnCloudinary(localThumbnailFile)

    if (!cloudVideoFile) {
        throw new ApiError(400, "Failed to upload Video  in cloudinary !!")
    }
    if (!cloudVideoFile) {
        throw new ApiError(400, "Failed to upload thumbanil in cloudinary !!")
    }

    // Create new video publish
    const video = await Video.create({
        title,
        description,
        videoFile: cloudVideoFile.url,
        thumbnail: cloudThumbnailFile.url,
        duration: cloudVideoFile?.duration / 60 || "",
        isPublished: togglePublishVideo.updatedVideoToggle,
        owner: userId
    })

    // const publishedVideo = await Video.findById(video._id)
    if (!video) {
        throw new ApiError(400, "Something went wrong while publishing video.")
    }

    // Aggregation pipeline to get video with owner details
    const videoWithOwner = await Video.aggregate([
        {
            $match: {
                _id: video._id
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner"
            }
        },
        {
            $unwind: "$owner"
        },
        {
            $addFields: {
                owner: "$owner",
            }
        },
        {
            $project: {
                title: 1,
                description: 1,
                videoFile: 1,
                thumbnail: 1,
                duration: 1,
                views: 1,
                isPublished: 1,
                owner: 1,
            }
        }
    ])
    if (!videoWithOwner?.length) {
        throw new ApiError(400, "Failed to retrive video with owner detail.")
    }

    return res.status(200).json(new ApiResponse(200, { video: videoWithOwner[0] }, "Video published successfully"))
})

// controller to get videos
const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query = "", sortBy = "createdAt", sortType = "desc", userId } = req.query

    // Building the filter object
    let filter = {};
    if (query) {
        filter.title = {
            $regex: query,
            $options: "i"
        },// 'title' is a field in the Video schema
        {
            new: true
        };
    }
    if (userId) {
        filter.userId = userId;
    }

    try {
        // Fetch videos with pagination, filtering, and sorting
        const videos = await Video.find(filter)
            .sort({ [sortBy]: sortType === "desc" ? -1 : 1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        // Total count for pagination
        const totalVideos = await Video.countDocuments(filter);

        if (videos.length > 0) {
            return res
                .status(200)
                .json(new ApiResponse(
                    200,
                    {
                        videos,
                        currentPage: page,
                        totalPages: Math.ceil(totalVideos / limit),
                        totalVideos
                    },
                    "Videos retrieved.",
                ));
        } else {
            throw new ApiError(404, "No videos found.");
        }
    } catch (error) {
        return res
            .status(error.statusCode || 500)
            .json(new ApiError(error.statusCode || 500, error.message || "Failed to retrieve videos."));
    }
});

// controller to get video
const getVideoByID = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (!videoId) {
        throw new ApiError(400, "VideoId is invalid!!")
    }

    // find single video with videoId and return its data
    try {
        const video = await Video.findById(videoId)

        if (video) {
            return res.status(200).json(new ApiResponse(200, { video }, "Video fetched successfully with videoId"))
        } else {
            return res.status(400).json(new ApiError(400, "Failed to find video with videoId"))
        }
    } catch (error) {
        console.status(500).json(new ApiError(500, "Internal server error"))
    }

})

// controller to update video details
const updateVideoDetails = asyncHandler(async (req, res) => {
    // get title & description from body
    const { title, description } = req.body
    if (!title && !description) {
        throw new ApiError(401, "Either title or description is required!!")
    }

    // get videoId from params
    const { videoId } = req.params
    if (!videoId) {
        throw new ApiError(400, "VideoId is invalid!!")
    }

    //find video and update it's details
    const video = await Video.findByIdAndUpdate(videoId,
        {
            $set: {
                title,
                description
            }
        },
        {
            new: true
        }
    )
    if (!video) {
        throw new ApiError(400, "Something went wrong while updating video detail.")
    }
    // return the success response
    return res
        .status(200)
        .json(new ApiResponse(200, { video }, "Video details updated successfully."))
})

// Controller to update video
const updateVideoFile = asyncHandler(async (req, res) => {
    // Get the uploaded video file path
    const newVideoLocalFilePath = req.file?.path;
    // Check if the video file is missing
    if (!newVideoLocalFilePath) {
        throw new ApiError(400, "Missing video for update");
    }

    // Upload the video file to Cloudinary (or another cloud service)
    const videoFile = await uploadOnCloudinary(newVideoLocalFilePath);
    // Check if the video upload failed
    if (!videoFile?.url) {
        throw new ApiError(400, "Failed to upload video");
    }

    // Get videoId from params
    const { videoId } = req.params;

    // Check if the videoId is invalid
    if (!videoId) {
        throw new ApiError(400, "Invalid or missing videoId");
    }

    try {
        // Update the video with the new video file URL
        const updatedVideo = await Video.findByIdAndUpdate(
            videoId,
            {
                $set: {
                    videoFile: videoFile.url
                }
            },
            {
                new: true, // Return the updated document
            }
        );
        // Check if the video update failed
        if (!updatedVideo) {
            throw new ApiError(400, "Something went wrong while updating the video");
        }

        // Return the updated video in the response
        return res.status(200).json(new ApiResponse(200, { updatedVideo }, "Video updated successfully."));
    } catch (error) {
        throw new ApiError(500, error.message || "Failed to update video");
    }
});

// Controller to update video thumbnail
const updateThumbnail = asyncHandler(async (req, res) => {
    // Get the uploaded thumbnail file path
    const newThumbnail = req.file?.path;
    if (!newThumbnail) {
        throw new ApiError(400, "Missing thumbnail for update");
    }

    // Upload the thumbnail to Cloudinary (or another cloud service)
    const thumbnail = await uploadOnCloudinary(newThumbnail);
    // Check if the thumbnail upload failed
    if (!thumbnail?.url) {
        throw new ApiError(400, "Failed to upload thumbnail");
    }

    // Get videoId from params
    const { videoId } = req.params;

    // Check if the videoId is invalid
    if (!videoId) {
        throw new ApiError(400, "Invalid or missing videoId");
    }

    try {
        // Update the video with the new thumbnail URL
        const updatedVideo = await Video.findByIdAndUpdate(
            videoId,
            {
                $set: {
                    thumbnail: thumbnail.url // Use the URL from the uploaded thumbnail
                }
            },
            {
                new: true, // Return the updated document
            }
        );

        // Check if the video update failed
        if (!updatedVideo) {
            throw new ApiError(400, "Something went wrong while updating the thumbnail");
        }

        // Return the updated video in the response
        return res.status(200).json(new ApiResponse(200, { updatedVideo }, "Thumbnail updated successfully."));
    } catch (error) {
        throw new ApiError(500, error.message || "Failed to update thumbnail");
    }
});

//controller to delete video
const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (!videoId) {
        throw new ApiError(400, "VideoId is missing ")
    }

    const video = await Video.findById(videoId)
    if (!video) {
        throw new ApiError(409, "Video not found!!")
    } else {
        const deletedVideo = await Video.findByIdAndDelete(videoId)
        if (!deletedVideo) {
            throw new ApiError(400, "Failed to delete video")
        }
        return res.status(200).json(new ApiResponse(200, "Video deleted successfully."))
    }
})

// Controller to toggle publish video
const togglePublishVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    // Check if videoId is provided
    if (!videoId) {
        throw new ApiError(400, "VideoId is missing");
    }

    // Find the video by its ID
    const video = await Video.findById(videoId);

    // If the video doesn't exist, throw an error
    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // Toggle the 'published' status
    const updatedVideoToggle = await Video.findByIdAndUpdate(videoId,
        {
            $set: {
                isPublished: !video.isPublished
            }
        },
        {
            new: true, // Return the updated video document
        }
    );

    // If something went wrong with the update
    if (!updatedVideoToggle) {
        throw new ApiError(500, "Failed to toggle video published status");
    }

    // Return success response with updated video details
    return res.status(200).json(new ApiResponse(200, { updatedVideoToggle }, "Video publish status toggled successfully."));
});


export {
    publishVideo,
    getAllVideos,
    getVideoByID,
    updateVideoDetails,
    updateVideoFile,
    updateThumbnail,
    deleteVideo,
    togglePublishVideo
}