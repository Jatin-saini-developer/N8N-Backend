class ApiResponse {
  constructor(statusCode, message, data = null) {
    this.success = statusCode < 400
    this.message = message
    this.data = data
  }
}

export default ApiResponse