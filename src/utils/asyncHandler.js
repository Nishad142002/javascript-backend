// ** using promises wraper code

const asyncHandler = (requestHandler) => {
  (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err))
  }
}



export {asyncHandler}


// const asyncHandler = () => {}
// const asyncHandler = (func) => { () => {} }  // higher order function (how take function as parameter)
// const asyncHandler = (func) =>  () => {} 
// const asyncHandler = (func) => async () => {} 


  // ** using try catch wraper code
/*
  const asyncHandler = (fn) => async (req, res, next) => {
    try {
      await fn(req, res, next)
    } catch (err) {
      res.status(err.code || 500).json({
        success: false,
        message: err.message
      })
    }
  }
*/