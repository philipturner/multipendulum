import { PendulumState } from "./PendulumState.js"
import { TimeStepper } from "./TimeStepper.js"
import { StateEquations } from "./StateEquations.js"

export class Simulation {
    numPendulums
    combinedPendulumLength
    gravitationalAcceleration

    pendulumMasses
    pendulumLengths

    frames
    savedComputeCallStack = []
    pendingStateGroup
    runningComputation = false

    isSimulating = false
    isReplaying = false

    // Alert the user when the simulation fails

    _failed = false

    get failed() {
        return this._failed
    }

    set failed(newValue) {
        if (newValue) {
            if (!this._failed) {
                const str1 = '<div class="options-spacer"></div>'
                const str2 = '<p id="failure-text"></p>'
                document.getElementById("failure-text-container").innerHTML = str1 + str2

                const str3 = "The simulation couldn't continue. Try again with different settings."
                document.getElementById("failure-text").innerHTML = str3
            }
        }

        this._failed = newValue
    }

    // Change the rendering based on replay frame ID history

    replayFrameID = 0
    lastReplayFrameID = 0
    beforeLastReplayFrameID = 0
    lastSimulatedFrameCount = 0
    startedFirstFrame = false

    timeStepper
    stateEquations

    canvas
    replayInterval
    executeSimulationStep
    simulationInterval

    constructor({ numPendulums, gravitationalAcceleration },
                { pendulumMasses, pendulumLengths, initialAngles, initialAngularVelocities }) {
        this.numPendulums = numPendulums
        this.combinedPendulumLength = pendulumLengths.reduce((a, b) => a + b , 0)
        this.gravitationalAcceleration = gravitationalAcceleration

        this.pendulumMasses = pendulumMasses.map((a) => a)
        this.pendulumLengths = pendulumLengths.map((a) => a)

        const angles = initialAngles.map((a) => a)
        const angularVelocities = initialAngularVelocities.map((a) => a)

        const firstFrame = PendulumState.firstState(angles, angularVelocities)
        firstFrame.normalizeAngles()
        this.frames = [[firstFrame]]

        this.stateEquations = new StateEquations(this)
        this.stateEquations.process(firstFrame)

        this.timeStepper = new TimeStepper(this, firstFrame.energy)

        // Prepare render and compute loops

        this.canvas = document.getElementById("canvas")

        const selfRef = this

        this.replayInterval = setInterval(() => { selfRef.update() }, 1000.0 / 60)

        this.executeSimulationStep = () => {
            if (selfRef.failed) {
                selfRef.isSimulating = false
                return
            }

            if (selfRef.isSimulating) {
                const callStack = selfRef.savedComputeCallStack
                const callStackLength = callStack.length

                if (callStackLength > 0) {
                    callStack[callStackLength - 1].evolve(callStack, selfRef)
                } else {
                    if (selfRef.startedFirstFrame)  {
                        selfRef.timeStepper.endFrame()
                    } else {
                        selfRef.startedFirstFrame = true
                    }

                    selfRef.timeStepper.startFrame()
                }
            }
        }

        this.renderStates(this.frames[0])
    }

    end() {
        this.isReplaying = false
        this.isSimulating = false

        clearInterval(this.replayInterval)
        clearInterval(this.simulationInterval)

        this.frames = null
    }

    update() {
        const simulatedFrameCount = this.frames.length - 1

        if (this.isReplaying && this.replayFrameID < simulatedFrameCount) {
            this.replayFrameID += 1

            const replayTime = this.replayFrameID / 60
            const timeString = replayTime.toFixed(2)
            const timeStringMiddle = timeString.length - 3

            const timeStringUpper = timeString.substring(0, timeStringMiddle)
            const timeStringLower = timeString.substring(timeStringMiddle)

            document.getElementById("replay-time-upper").innerHTML = timeStringUpper
            document.getElementById("replay-time-lower").innerHTML = timeStringLower
        }

        if (this.lastSimulatedFrameCount < simulatedFrameCount) {
            this.lastSimulatedFrameCount = simulatedFrameCount

            const simulatedTime = simulatedFrameCount / 60
            const timeString = simulatedTime.toFixed(2)
            const timeStringMiddle = timeString.length - 3

            const timeStringUpper = timeString.substring(0, timeStringMiddle)
            const timeStringLower = timeString.substring(timeStringMiddle)

            document.getElementById("simulated-time-upper").innerHTML = timeStringUpper
            document.getElementById("simulated-time-lower").innerHTML = timeStringLower
        }

        const currentlyEndedReplaying = this.lastReplayFrameID === this.replayFrameID
        const previouslyEndedReplaying = this.beforeLastReplayFrameID === this.lastReplayFrameID

        if (!previouslyEndedReplaying && currentlyEndedReplaying) {
            const lastStateGroup = this.frames[this.replayFrameID]

            this.renderStates([lastStateGroup[lastStateGroup.length - 1]])
        } else if (!currentlyEndedReplaying) {
            this.renderStates(this.frames[this.replayFrameID])
        }

        this.beforeLastReplayFrameID = this.lastReplayFrameID
        this.lastReplayFrameID = this.replayFrameID

        if (this.isSimulating) {
            if (!this.failed) {
                if (!this.runningComputation) {
                    this.simulationInterval = setInterval(this.executeSimulationStep, 0.5)
                    this.runningComputation = true
                }
            }
        } else if (this.runningComputation) {
            clearInterval(this.simulationInterval)
            this.runningComputation = false

            if (this.failed) {
                this.timeStepper.endFrame()
            }
        }
    }

    renderStates(states) {
        const windowSize = this.canvas.width
        const windowRadius = windowSize * 0.5

        const context = this.canvas.getContext("2d")
        const numPendulums = this.numPendulums

        // Background
        context.fillStyle = "rgb(220, 220, 220)"
        context.fillRect(0, 0, windowSize, windowSize)

        // Background Circle
        context.fillStyle = "#FFF"

        context.beginPath()
        context.arc(windowRadius, windowRadius, windowRadius, 0,2 * Math.PI)
        context.fill()

        // Pendulums
        context.strokeStyle = "#F00"
        context.lineWidth = 5
        context.lineJoin = "bevel"
        context.beginPath()

        const lastJointAdjustment = windowSize / (windowSize + 10)
        const lengthMultiplier = (windowRadius / this.combinedPendulumLength) * lastJointAdjustment

        const numStates = states.length

        for (let i = 0; i < numStates; ++i) {
            context.moveTo(windowRadius, windowRadius)

            const state = states[i]
            const coordsX = state.coordsX
            const coordsY = state.coordsY

            for (let i = 0; i < numPendulums; ++i) {
                const currentX = windowRadius + coordsX[i] * lengthMultiplier
                const currentY = windowRadius - coordsY[i] * lengthMultiplier

                // Draw the i-th pendulum

                context.lineTo(currentX, currentY)
            }
        }

        context.stroke()

        // Joints
        context.fillStyle = "#000"

        context.beginPath()
        context.arc(windowRadius, windowRadius, 5, 0, 2 * Math.PI)
        context.fill()

        for (let i = 0; i < numStates; ++i) {
            const state = states[i]
            const coordsX = state.coordsX
            const coordsY = state.coordsY

            for (let i = 0; i < numPendulums; ++i) {
                const currentX = windowRadius + coordsX[i] * lengthMultiplier
                const currentY = windowRadius - coordsY[i] * lengthMultiplier

                // Draw the i-th pendulum

                context.beginPath()
                context.arc(currentX, currentY, 5, 0, 2 * Math.PI)
                context.fill()
            }
        }
    }
}
