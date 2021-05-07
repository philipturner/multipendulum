class PendulumState {
    // a timestamp for this state
    // a value of one means 1/60 of a second
    frameProgress

    angles
    angularVelocities
    momenta

    coordsX
    coordsY
    energy

    static firstState(initialAngles, initialAngularVelocities) {
        return new PendulumState({
            frameProgress: 0,
            angles:            initialAngles,
            angularVelocities: initialAngularVelocities
        })
    }

    constructor({ frameProgress, angles, angularVelocities, momenta }) {
        this.frameProgress = frameProgress
        this.angles = angles

        this.angularVelocities = angularVelocities
        this.momenta = momenta
    }

    normalizeAngles() {
        this.angles = this.angles.map((angle) => {
            const remainder = angle % (2 * Math.PI)

            if (remainder < 0) {
                return remainder + 2 * Math.PI
            } else {
                return remainder
            }
        })
    }
}

class Simulation {
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

        // Remove braces around the arrow function in this line
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

function mix(min, max, t) {
    return min * (1 - t) + max * t
}

class SimulationPrototype {
    _numPendulums
    get numPendulums() { return this._numPendulums }
    set numPendulums(rawNewValue) {
        const newValue = Math.min(1000, Math.max(1, rawNewValue))
        const previousNumPendulums = this.numPendulums

        if (previousNumPendulums < newValue) {
            for (let i = previousNumPendulums; i < newValue; ++i) {
                this._customLengthArray.push(this.defaultLength)
                this._customMassArray.push(this.defaultMass)
                this._customAnglePercentArray.push(this.defaultAnglePercent)
                this._customAngularVelocityArray.push(this.defaultAngularVelocity)
            }
        }

        this._numPendulums = newValue
    }

    combinedPendulumLength
    gravitationalAcceleration

    doingCustomLengths
    doingCustomMasses
    doingCustomInitialAnglePercents
    doingCustomInitialAngularVelocities

    customLengthType
    customMassType
    customAngleType
    customAngularVelocityType

    _customLengthArray = []
    _customMassArray = []
    _customAnglePercentArray = []
    _customAngularVelocityArray = []

    get customLengthArray() { return this._customLengthArray }
    get customMassArray() { return this._customMassArray }
    get customAnglePercentArray() { return this._customAnglePercentArray }
    get customAngularVelocityArray() { return this._customAngularVelocityArray }

    defaultLength
    defaultMass
    defaultAnglePercent
    defaultAngularVelocity

    doingLengthNormalization

    canvas

    constructor() {
        this.combinedPendulumLength = 1
        this.gravitationalAcceleration = 9.8

        this.doingCustomLengths = false
        this.doingCustomMasses = false
        this.doingCustomInitialAnglePercents = false
        this.doingCustomInitialAngularVelocities = false

        this.customLengthType = "randomLengths"
        this.customMassType = "randomMasses"
        this.customAngleType = "randomAnglePercents"
        this.customAngularVelocityType = "randomAngularVelocities"

        this.defaultLength = 1
        this.defaultMass = 1
        this.defaultAnglePercent = 75
        this.defaultAngularVelocity = 0

        this.numPendulums = 3

        this.doingLengthNormalization = false

        this.canvas = document.getElementById("canvas")
    }

    get simulation() {
        return new Simulation({
            numPendulums: this.numPendulums,
            gravitationalAcceleration: this.gravitationalAcceleration
        },
        {
            pendulumMasses: this.masses,
            pendulumLengths: this.lengths,
            initialAngles: this.initialAnglesInRadians,
            initialAngularVelocities: this.initialAngularVelocities
        })
    }

    present() {
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
        const lengths = this.lengths
        const angles = this.initialAnglesInRadians

        let currentX = windowRadius
        let currentY = windowRadius

        context.moveTo(currentX, currentY)

        for (let i = 0; i < numPendulums; ++i) {
            const length_i = lengths[i] * lengthMultiplier
            const angle_i = angles[i]

            const offsetX = Math.sin(angle_i) * length_i
            const offsetY = Math.cos(angle_i) * length_i

            currentX += offsetX
            currentY += offsetY

            // Draw the i-th pendulum

            context.lineTo(currentX, currentY)
        }

        context.stroke()

        // Joints
        context.fillStyle = "#000"

        context.beginPath()
        context.arc(windowRadius, windowRadius, 5, 0, 2 * Math.PI)
        context.fill()

        currentX = windowRadius
        currentY = windowRadius

        for (let i = 0; i < numPendulums; ++i) {
            const length_i = lengths[i] * lengthMultiplier
            const angle_i = angles[i]

            const offsetX = Math.sin(angle_i) * length_i
            const offsetY = Math.cos(angle_i) * length_i

            currentX += offsetX
            currentY += offsetY

            // Draw the i-th pendulum

            context.beginPath()
            context.arc(currentX, currentY, 5, 0, 2 * Math.PI)
            context.fill()
        }
    }

    get lengths() {
        const numPendulums = this.numPendulums
        let output

        if (!this.doingCustomLengths) {
            output = []
            const length = this.combinedPendulumLength / numPendulums

            for (let i = 0; i < numPendulums; ++i) {
                output.push(length)
            }
        } else {
            switch (this.customLengthType) {
                case "randomLengths":
                    output = this.randomLengths
                    break
                case "endIsLongerLengths":
                    output = this.endIsLongerLengths
                    break
                case "endIsShorterLengths":
                    output = this.endIsShorterLengths
                    break
                default:
                    output = this.customLengthArray
                    break
            }

            if (this.doingLengthNormalization) {
                const combinedLength = output.reduce((a, b) => a + b, 0)
                const multiplier = 1 / combinedLength

                output = output.map((a) => a * multiplier)
            }
        }

        return output
    }

    get masses() {
        if (!this.doingCustomMasses) {
            const output = []
            const numPendulums = this.numPendulums

            const mass = this.defaultMass

            for (let i = 0; i < numPendulums; ++i) {
                output.push(mass)
            }

            return output
        } else {
            switch (this.customMassType) {
                case "randomMasses":
                    return this.randomMasses
                case "endIsHeavierMasses":
                    return this.endIsHeavierMasses
                case "endIsLighterMasses":
                    return this.endIsLighterMasses
                default:
                    return this.customMassArray
            }
        }
    }

    get initialAnglesInRadians() {
        let output

        if (!this.doingCustomLengths) {
            output = []

            const numPendulums = this.numPendulums
            const initialAnglePercent = this.defaultAnglePercent

            for (let i = 0; i < numPendulums; ++i) {
                output.push(initialAnglePercent)
            }
        } else {
            switch (this.customAngleType) {
                case "randomAnglePercents":
                    output = this.randomAnglePercents
                    break
                case "staircaseAnglePercents":
                    output = this.staircaseAnglePercents
                    break
                case "spiralAnglePercents":
                    output = this.spiralAnglePercents
                    break
                default:
                    output = this.customAnglePercentArray
                    break

            }
        }

        return output.map((a) => a * (0.01 * Math.PI))
    }

    get initialAngularVelocities() {
        if (!this.doingCustomInitialAngularVelocities) {
            const output = []

            const numPendulums = this.numPendulums
            const initialAngularVelocity = this.defaultAngularVelocity

            for (let i = 0; i < numPendulums; ++i) {
                output.push(initialAngularVelocity)
            }

            return output
        } else {
            switch (this.customAngularVelocityType) {
                case "randomAngularVelocities":
                    return this.randomAngularVelocities
                default:
                    return this.customAngularVelocityArray
            }
        }
    }

    // Lengths

    get randomLengths() {
        const output = []

        const numPendulums = this.numPendulums
        const defaultLength = this.defaultLength

        const minLength = 0.1 * defaultLength
        const maxLength = 2.0 * defaultLength

        for (let i = 0; i < numPendulums; ++i) {
            output.push(mix(minLength, maxLength, Math.random()))

        }

        return output
    }

    get endIsLongerLengths() {
        const numPendulums = this.numPendulums
        const defaultLength = this.defaultLength

        if (numPendulums === 1) {
            return [defaultLength]
        }

        const output = []

        const minLength = 0.1 * defaultLength
        const maxLength = 2.0 * defaultLength

        const multiplier = 1 / (numPendulums - 1)

        for (let i = 0; i < numPendulums; ++i) {
            output.push(mix(minLength, maxLength, i * multiplier))
        }

        return output
    }

    get endIsShorterLengths() {
        const numPendulums = this.numPendulums
        const defaultLength = this.defaultLength

        if (numPendulums === 1) {
            return [defaultLength]
        }

        const output = []

        const maxLength = 2.0 * defaultLength
        const minLength = 0.1 * defaultLength

        const multiplier = 1 / (numPendulums - 1)

        for (let i = 0; i < numPendulums; ++i) {
            output.push(mix(maxLength, minLength, i * multiplier))
        }

        return output
    }

    // Masses

    get randomMasses() {
        const output = []

        const numPendulums = this.numPendulums
        const defaultMass = this.defaultMass

        const minMass = 0.1 * defaultMass
        const maxMass = 2.0 * defaultMass

        for (let i = 0; i < numPendulums; ++i) {
            output.push(mix(minMass, maxMass, Math.random()))

        }

        return output
    }

    get endIsHeavierMasses() {
        const numPendulums = this.numPendulums
        const defaultMass = this.defaultMass

        if (numPendulums === 1) {
            return [defaultMass]
        }

        const output = []

        const minMass = 0.1 * defaultMass
        const maxMass = 2.0 * defaultMass

        const multiplier = 1 / (numPendulums - 1)

        for (let i = 0; i < numPendulums; ++i) {
            output.push(mix(minMass, maxMass, i * multiplier))
        }

        return output
    }

    get endIsLighterMasses() {
        const numPendulums = this.numPendulums
        const defaultMass = this.defaultMass

        if (numPendulums === 1) {
            return [defaultMass]
        }

        const output = []

        const maxMass = 2.0 * defaultMass
        const minMass = 0.1 * defaultMass

        const multiplier = 1 / (numPendulums - 1)

        for (let i = 0; i < numPendulums; ++i) {
            output.push(mix(maxMass, minMass, i * multiplier))
        }

        return output
    }

    // Angles

    get randomAnglePercents() {
        const output = []

        const numPendulums = this.numPendulums

        const minAnglePercent = 0
        const maxAnglePercent = 200

        for (let i = 0; i < numPendulums; ++i) {
            output.push(mix(minAnglePercent, maxAnglePercent, Math.random()))

        }

        return output
    }

    get staircaseAnglePercents() {
        const output = []

        const numPendulums = this.numPendulums

        for (let i = 0; i < numPendulums; ++i) {
            output.push((i & 1) === 0 ? 50 : 100)
        }

        return output
    }

    get spiralAnglePercents() {
        const numPendulums = this.numPendulums

        if (numPendulums === 1) {
            return 51
        }

        const output = []

        const minAnglePercent = 51
        const maxAnglePercent = 500

        const multiplier = 1 / (numPendulums - 1)

        for (let i = 0; i < numPendulums; ++i) {
            const mixingProportion = Math.sqrt(i * multiplier)
            output.push(mix(minAnglePercent, maxAnglePercent, mixingProportion))
        }

        return output
    }

    // Angular Velocities

    get randomAngularVelocities() {
        const output = []

        const numPendulums = this.numPendulums

        const minAngularVelocity = -5
        const maxAngularVelocity =  5

        for (let i = 0; i < numPendulums; ++i) {
            output.push(mix(minAngularVelocity, maxAngularVelocity, Math.random()))

        }

        return output
    }
}

class StateEquations {
    numPendulums
    simulation

    masses
    lengths

    massSums
    massSumsTimesLengthsTimesGravity
    massSumsTimesLengthProducts

    constantPotential

    transientMatrixLayers
    transientMatrixDerivativeLayers
    transientPartialDerivatives

    constructor(simulation) {
        const numPendulums = simulation.numPendulums
        this.numPendulums = numPendulums
        this.simulation = simulation

        // Initialize masses and lengths

        this.masses = simulation.pendulumMasses
        this.lengths = simulation.pendulumLengths

        // Store terms that would otherwise
        // be redundantly calculated

        this.massSums = []
        let accumulatedMass = 0

        for (let i = 1; i <= numPendulums; ++i) {
            accumulatedMass += this.masses[numPendulums - i]
            this.massSums.push(accumulatedMass)
        }

        this.massSums.reverse()

        this.massSumsTimesLengthsTimesGravity = []

        for (let i = 0; i < numPendulums; ++i) {
            let nextElement = this.massSums[i] * this.lengths[i]
            nextElement *= (-0.5 * simulation.gravitationalAcceleration)

            this.massSumsTimesLengthsTimesGravity.push(nextElement)
        }

        this.massSumsTimesLengthProducts = []

        for (let i = 0; i < numPendulums; ++i) {
            let nextArray = []
            const length_i = this.lengths[i]

            for (let j = 0; j < numPendulums; ++j) {
                const massSum = this.massSums[Math.max(i, j)]
                const lengthProduct = length_i * this.lengths[j]

                nextArray.push(massSum * lengthProduct)
            }

            this.massSumsTimesLengthProducts.push(nextArray)
        }

        // Adding `constantPotential` to the potential energy
        // ensures that potential energy is always greater
        // than or equal to zero.

        let constantPotential = 0
        let accumulatedLength = 0

        for (let i = 0; i < numPendulums; ++i) {
            accumulatedLength += this.lengths[i]
            constantPotential += accumulatedLength * this.masses[i]
        }

        constantPotential *= 0.5 * simulation.gravitationalAcceleration
        this.constantPotential = constantPotential

        // Allocate memory for transient matrix layers

        const rowSize = numPendulums + 1
        const layerSize = numPendulums * rowSize

        this.transientMatrixLayers = [
            Array(layerSize),
            Array(layerSize)
        ]

        this.transientMatrixDerivativeLayers = [
            Array(numPendulums * layerSize),
            Array(numPendulums * layerSize)
        ]

        this.transientPartialDerivatives = Array(numPendulums)
    }

    process(state, { returningForces } = { returningForces: false }) {
        let forces

        if (state.momenta == null) {
            const numPendulums = this.numPendulums
            const angles = state.angles

            let momenta = []

            for (let i = 0; i < numPendulums; ++i) {
                let momentum = 0
                const angle_i = angles[i]

                const massSumsTimesLengthProducts_i = this.massSumsTimesLengthProducts[i]

                for (let j = 0; j < numPendulums; ++j) {
                    let multiplier = massSumsTimesLengthProducts_i[j]
                    multiplier *= state.angularVelocities[j]

                    const cosval = Math.cos(angle_i - angles[j])

                    momentum += cosval * multiplier
                }

                momenta.push(momentum)
            }

            state.momenta = momenta
        } else if (state.angularVelocities == null) {
            if (returningForces) {
                let angularVelocitiesAndForces = this.solveAngularVelocitiesAndForces(state.angles, state.momenta)

                state.angularVelocities = angularVelocitiesAndForces.angularVelocities
                forces = angularVelocitiesAndForces.forces
            } else {
                state.angularVelocities = this.solveAngularVelocities(state.angles, state.momenta)
            }
        } else if (returningForces) {
            let angularVelocitiesAndForces = this.solveAngularVelocitiesAndForces(state.angles, state.momenta)

            state.angularVelocities = angularVelocitiesAndForces.angularVelocities
            forces = angularVelocitiesAndForces.forces
        }

        this.solveEnergy(state)

        return forces
    }

    solveEnergy(state) {
        let potential = 0
        let kinetic = 0

        let coordsX = []
        let coordsY = []

        const numPendulums = this.numPendulums

        for (let i = 0; i < numPendulums; ++i) {
            const angle = state.angles[i]

            const sinval = Math.sin(angle)
            const cosval = Math.cos(angle)

            const length = this.lengths[i]

            let lastCoordX
            let lastCoordY

            if (i === 0) {
                lastCoordX = 0
                lastCoordY = 0
            } else {
                lastCoordX = coordsX[i - 1]
                lastCoordY = coordsY[i - 1]
            }

            const nextCoordX = sinval * length + lastCoordX
            coordsX.push(nextCoordX)

            const nextCoordY = -cosval * length + lastCoordY
            coordsY.push(nextCoordY)

            // Update potential and kinetic energy

            potential += this.masses[i] * nextCoordY
            kinetic += state.momenta[i] * state.angularVelocities[i]
        }

        potential *= 0.5 * this.simulation.gravitationalAcceleration
        potential += this.constantPotential

        kinetic *= 0.5

        state.energy = potential + kinetic

        state.coordsX = coordsX
        state.coordsY = coordsY
    }

    solveAngularVelocities(angles, momenta) {
        this.solveOnlyMatrix(angles, momenta)
        const numPendulums = this.numPendulums

        const rowSize = numPendulums + 1

        const lastLayer = this.transientMatrixLayers[1]
        let lastLayerOffset = 0

        let outputAngularVelocities = []

        for (let i = 0; i < numPendulums; ++i) {
            const nValue = lastLayer[lastLayerOffset + numPendulums]
            const iValue = lastLayer[lastLayerOffset + i]

            outputAngularVelocities.push(nValue / iValue)

            lastLayerOffset += rowSize
        }

        return outputAngularVelocities
    }

    solveAngularVelocitiesAndForces(angles, momenta) {
        this.solveMatrixWithDerivative(angles, momenta)
        const numPendulums = this.numPendulums

        const rowSize = numPendulums + 1
        const layerSize = numPendulums * rowSize

        const lastLayer = this.transientMatrixLayers[1]
        const lastDerivativeLayer = this.transientMatrixDerivativeLayers[1]

        let outputAngularVelocities = []
        let outputForces = []

        for (let i = 0; i < numPendulums; ++i) {
            outputForces.push(0)
        }

        for (let i = 0; i < numPendulums; ++i) {
            // Find the angular velocity of the i-th pendulum

            const matrixOffset = i * rowSize

            const nValue = lastLayer[matrixOffset + numPendulums]
            const iValue = lastLayer[matrixOffset + i]

            const iValueReciprocal = 1 / iValue
            const angularVelocity = nValue * iValueReciprocal
            const nOver_iValueSquared = angularVelocity * iValueReciprocal

            outputAngularVelocities.push(angularVelocity)

            // Add to forces

            const momentum_i = momenta[i]

            let matrixDerivativeOffset = matrixOffset

            for (let h = 0; h < numPendulums; ++h) {
                const iDerivative = lastDerivativeLayer[matrixDerivativeOffset + i]
                let forceContribution = iDerivative * nOver_iValueSquared

                const nDerivative = lastDerivativeLayer[matrixDerivativeOffset + numPendulums]
                forceContribution = nDerivative * iValueReciprocal - forceContribution

                outputForces[h] += forceContribution * momentum_i

                matrixDerivativeOffset += layerSize
            }
        }

        const massSumsTimesLengthsTimesGravity = this.massSumsTimesLengthsTimesGravity

        for (let h = 0; h < numPendulums; ++h) {
            const multiplier = massSumsTimesLengthsTimesGravity[h]
            const sine_h = Math.sin(angles[h])

            let force = -0.5 * outputForces[h]
            force += multiplier * sine_h

            outputForces[h] = force
        }

        return { angularVelocities: outputAngularVelocities, forces: outputForces }
    }

    solveOnlyMatrix(angles, momenta) {
        const numPendulums = this.numPendulums
        const firstLayer = this.transientMatrixLayers[1]

        const rowSize = numPendulums + 1
        const layerSize = numPendulums * rowSize

        for (let i = 0; i < layerSize; ++i) {
            firstLayer[i] = 0
        }

        const massSumsTimesLengthProducts = this.massSumsTimesLengthProducts

        for (let i = 0; i < numPendulums; ++i) {
            let j = i + 1

            let   j_row = j * rowSize
            const i_row = i * rowSize

            const massSumsTimesLengthProducts_i = massSumsTimesLengthProducts[i]
            firstLayer[i_row + i] = massSumsTimesLengthProducts_i[i]

            let angle_i = angles[i]

            while (j < numPendulums) {
                const ijMultiplier = massSumsTimesLengthProducts_i[j]
                const angleDifference = angle_i - angles[j]

                const ijValue = ijMultiplier * Math.cos(angleDifference)

                firstLayer[i_row + j] = ijValue
                firstLayer[j_row + i] = ijValue

                j += 1
                j_row += rowSize
            }

            firstLayer[i_row + numPendulums] = momenta[i]
        }

        const transientMatrixLayers = this.transientMatrixLayers

        for (let i = 0; i < numPendulums; ++i) {
            const inputLayer  = transientMatrixLayers[1]
            const outputLayer = transientMatrixLayers[0]

            transientMatrixLayers[0] = inputLayer
            transientMatrixLayers[1] = outputLayer

            const iiiValue = inputLayer[i * (rowSize + 1)]

            for (let j = 0; j < numPendulums; ++j) {
                let ij_Offset = j * rowSize
                let ijiOffset = ij_Offset + i
                let ijiValue  = inputLayer[ijiOffset]

                let ijkOffset_end = ij_Offset + rowSize

                if (i === j || Math.abs(ijiValue) < 2.2250738585072014e-308) {
                    for (let ijkOffset = ij_Offset; ijkOffset < ijkOffset_end; ++ijkOffset) {
                        outputLayer[ijkOffset] = inputLayer[ijkOffset]
                    }
                } else {
                    let ijiReciprocal = 1 / ijiValue
                    let cachedTerm1 = iiiValue * ijiReciprocal

                    let j_less_than_i = j < i
                    let ijjOffset = ij_Offset + j
                    let ijDifferenceOffset = (i - j) * rowSize

                    for (let ijkOffset = ij_Offset; ijkOffset < ijkOffset_end; ++ijkOffset) {
                        if (ijkOffset > ijiOffset || (j_less_than_i && ijjOffset === ijkOffset)) {
                            let ijkValue = inputLayer[ijkOffset]
                            let iikValue = inputLayer[ijkOffset + ijDifferenceOffset]

                            outputLayer[ijkOffset] = ijkValue * cachedTerm1 - iikValue
                        } else {
                            outputLayer[ijkOffset] = 0
                        }
                    }
                }
            }
        }
    }

    solveMatrixWithDerivative(angles, momenta) {
        const numPendulums = this.numPendulums
        const firstLayer = this.transientMatrixLayers[1]
        const firstDerivativeLayer = this.transientMatrixDerivativeLayers[1]

        const rowSize = numPendulums + 1
        const layerSize = numPendulums * rowSize

        // Fill in the first layer of the matrix and matrix derivative

        for (let i = 0; i < layerSize; ++i) {
            firstLayer[i] = 0
            firstDerivativeLayer[i] = 0
        }

        for (let i = layerSize; i < numPendulums * layerSize; ++i) {
            firstDerivativeLayer[i] = 0
        }

        const massSumsTimesLengthProducts = this.massSumsTimesLengthProducts

        for (let i = 0; i < numPendulums; ++i) {
            const matrixFillStart = i + 1

            let ijOffset = i * rowSize
            let jiOffset = i

            let layerOffset = 0

            const i_row = ijOffset

            const massSumsTimesLengthProducts_i = massSumsTimesLengthProducts[i]
            firstLayer[i_row + i] = massSumsTimesLengthProducts_i[i]

            const angle_i = angles[i]

            for (let j = 0; j < numPendulums; ++j) {
                const ijMultiplier = massSumsTimesLengthProducts_i[j]
                const angleDifference = angle_i - angles[j]

                if (j >= matrixFillStart) {
                    const ijValue = ijMultiplier * Math.cos(angleDifference)

                    firstLayer[ijOffset] = ijValue
                    firstLayer[jiOffset] = ijValue
                }

                if (j !== i) {
                    const ijValue = ijMultiplier * Math.sin(angleDifference)

                    firstDerivativeLayer[layerOffset + ijOffset] = ijValue
                    firstDerivativeLayer[layerOffset + jiOffset] = ijValue
                }

                ijOffset += 1
                jiOffset += rowSize

                layerOffset += layerSize
            }

            firstLayer[i_row + numPendulums] = momenta[i]
        }

        const transientMatrixLayers = this.transientMatrixLayers
        const transientMatrixDerivativeLayers = this.transientMatrixDerivativeLayers
        const transientPartialDerivatives = this.transientPartialDerivatives

        for (let i = 0; i < numPendulums; ++i) {
            const inputLayer  = transientMatrixLayers[1]
            const outputLayer = transientMatrixLayers[0]

            transientMatrixLayers[0] = inputLayer
            transientMatrixLayers[1] = outputLayer

            const inputDerivativeLayer  = transientMatrixDerivativeLayers[1]
            const outputDerivativeLayer = transientMatrixDerivativeLayers[0]

            transientMatrixDerivativeLayers[0] = inputDerivativeLayer
            transientMatrixDerivativeLayers[1] = outputDerivativeLayer

            const iiiOffset = i * (rowSize + 1)
            let hiiiOffset = iiiOffset

            for (let h = 0; h < numPendulums; ++h) {
                transientPartialDerivatives[h] = inputDerivativeLayer[hiiiOffset]
                hiiiOffset += layerSize
            }

            const iiiValue = inputLayer[iiiOffset]

            for (let j = 0; j < numPendulums; ++j) {
                const ij_Offset = j * rowSize
                const ijiOffset = ij_Offset + i
                const ijiValue  = inputLayer[ijiOffset]

                const ijkOffset_end = ij_Offset + rowSize

                if (i === j || Math.abs(ijiValue) < 2.2250738585072014e-308) {
                    for (let ijkOffset = ij_Offset; ijkOffset < ijkOffset_end; ++ijkOffset) {
                        outputLayer[ijkOffset] = inputLayer[ijkOffset]

                        let hijkOffset = ijkOffset

                        for (let h = 0; h < numPendulums; ++h) {
                            outputDerivativeLayer[hijkOffset] = inputDerivativeLayer[hijkOffset]
                            hijkOffset += layerSize
                        }
                    }
                } else {
                    const ijiReciprocal = 1 / ijiValue
                    const cachedTerm1 = iiiValue * ijiReciprocal

                    const j_less_than_i = j < i
                    const ijjOffset = ij_Offset + j

                    const ijDifferenceOffset = (i - j) * rowSize

                    for (let ijkOffset = ij_Offset; ijkOffset < ijkOffset_end; ++ijkOffset) {
                        if (ijkOffset > ijiOffset || (j_less_than_i && ijjOffset === ijkOffset)) {
                            const ijkValue = inputLayer[ijkOffset]
                            const cachedTerm2 = ijkValue * ijiReciprocal
                            const cachedTerm3 = cachedTerm1 * cachedTerm2

                            const iikOffset = ijkOffset + ijDifferenceOffset
                            const iikValue = inputLayer[iikOffset]
                            outputLayer[ijkOffset] = ijkValue * cachedTerm1 - iikValue

                            let hijkOffset = ijkOffset
                            let hijiOffset = ijiOffset
                            let hiikOffset = iikOffset

                            for (let h = 0; h < numPendulums; ++h) {
                                const hiikDerivative = inputDerivativeLayer[hiikOffset]
                                const hijiDerivative = inputDerivativeLayer[hijiOffset]
                                let output = hijiDerivative * cachedTerm3 + hiikDerivative

                                const hiiiDerivative = transientPartialDerivatives[h]
                                output = hiiiDerivative * cachedTerm2 - output

                                const hijkDerivative = inputDerivativeLayer[hijkOffset]
                                output = hijkDerivative * cachedTerm1 + output

                                outputDerivativeLayer[hijkOffset] = output

                                hijkOffset += layerSize
                                hijiOffset += layerSize
                                hiikOffset += layerSize
                            }
                        } else {
                            outputLayer[ijkOffset] = 0

                            let hijkOffset = ijkOffset

                            for (let h = 0; h < numPendulums; ++h) {
                                outputDerivativeLayer[hijkOffset] = 0
                                hijkOffset += layerSize
                            }
                        }
                    }
                }
            }
        }
    }
}
