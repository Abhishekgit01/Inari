"""Custom exception hierarchy for CyberGuardian AI API."""

from __future__ import annotations


class CyberGuardianException(Exception):
    """Base exception with error codes for the API."""

    code: str = "INTERNAL_ERROR"
    status_code: int = 500
    detail: str = "An unexpected error occurred."

    def __init__(self, detail: str | None = None, code: str | None = None):
        self.detail = detail or self.detail
        self.code = code or self.code
        super().__init__(self.detail)


class ResourceNotFound(CyberGuardianException):
    code = "RESOURCE_NOT_FOUND"
    status_code = 404
    detail = "The requested resource was not found."


class SimulationNotFound(ResourceNotFound):
    code = "SIMULATION_NOT_FOUND"
    detail = "Simulation with the given ID was not found."


class InvalidParameter(CyberGuardianException):
    code = "INVALID_PARAMETER"
    status_code = 422
    detail = "One or more parameters are invalid."


class RateLimitExceeded(CyberGuardianException):
    code = "RATE_LIMIT_EXCEEDED"
    status_code = 429
    detail = "Rate limit exceeded. Please slow down."


class SimulationAlreadyDone(CyberGuardianException):
    code = "SIMULATION_DONE"
    status_code = 409
    detail = "Simulation has already terminated."


class SIEMParseError(CyberGuardianException):
    code = "SIEM_PARSE_ERROR"
    status_code = 400
    detail = "Could not parse the uploaded SIEM feed."
