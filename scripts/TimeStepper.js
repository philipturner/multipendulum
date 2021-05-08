import { PendulumState } from "./PendulumState.js"

export class CallStackNode {
    recursionLevel

    frameStart
    frameEnd

    isRecursive = false
    isCompleted = false

    constructor(recursionLevel, frameStart, frameEnd) {
        this.recursionLevel = recursionLevel
        this.frameStart = frameStart
        this.frameEnd = frameEnd
    }

    pushFirstHalf(callStack) {
        this.isRecursive = true

        callStack.push(new CallStackNode(this.recursionLevel + 1,
            this.frameStart, (this.frameStart + this.frameEnd) * 0.5))
    }

    evolve(callStack, simulation) {
        if (this.isRecursive) {
            if (this.isCompleted) {
                callStack.pop()

                const callStackLength = callStack.length
                if (callStackLength > 0) {
                    callStack[callStackLength - 1].evolve(callStack, simulation)
                }

                return
            } else {
                // Execute the second half of this time step

                callStack.push(new CallStackNode(this.recursionLevel + 1,
                    (this.frameStart + this.frameEnd) * 0.5, this.frameEnd))
                this.isCompleted = true
            }
        }

        if (callStack.length > 0) {
            simulation.timeStepper.doTimeStep(callStack)
        }
    }
}

export class TimeStepper {
    rkdpCoefficients = [
        [],
        [    1 / 5],
        [    3 / 40,        9 / 40],
        [   44 / 45,      -56 / 15,      32 / 9],
        [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
        [ 9017 / 3168,   -355 / 33,   46732 / 5247,   49 / 176, -5103 / 18656]
    ]

    weights = [
           35 / 384,
              0,
          500 / 1113,
          125 / 192,
        -2187 / 6784,
           11 / 84
    ]

    altWeights = [
          5197 / 57600,
               0,
          7571 / 16695,
           393 / 640,
        -92097 / 339200,
           187 / 2100,
             1 / 40
    ]

    numPendulums
    simulation

    lastRecursionLevel = 0
    recursionLevelStreak = 0

    energy
    energyRange
    maxError

    cachedForces = []

    constructor(simulation, energy) {
        this.maxError = 1e-4 * simulation.numPendulums * simulation.combinedPendulumLength
        this.numPendulums = simulation.numPendulums

        this.simulation = simulation
        this.energy = energy

        this.energyRange = 5e-4 * energy
    }

    startFrame() {
        const frames = this.simulation.frames
        const lastStateGroup = frames[frames.length - 1]
        const lastState = lastStateGroup[lastStateGroup.length - 1]

        this.simulation.pendingStateGroup = [lastState]

        const frameStart = lastState.frameProgress
        const firstNode = new CallStackNode(0, frameStart, frameStart + 1)

        const callStack = this.simulation.savedComputeCallStack
        callStack.push(firstNode)

        this.doTimeStep(callStack)
    }

    endFrame() {
        let pendingStateGroup = this.simulation.pendingStateGroup
        const i_end = pendingStateGroup.length

        if (i_end > 1) {
            let adjustedStateGroup = []

            const numPendulums = this.numPendulums
            let modulusOperand

            if (numPendulums <= 25) {
                modulusOperand = 1.0 / 32
            } else if (numPendulums <= 50) {
                modulusOperand = 1.0 / 16
            } else if (numPendulums <= 100) {
                modulusOperand = 1.0 / 8
            } else if (numPendulums <= 200) {
                modulusOperand = 1.0 / 4
            } else if (numPendulums <= 400) {
                modulusOperand = 1.0 / 2
            } else {
                modulusOperand = 1.0
            }

            for (let i = 1; i < i_end; ++i) {
                let element = pendingStateGroup[i]

                if ((element.frameProgress % modulusOperand) === 0) {
                    adjustedStateGroup.push(element)
                }
            }

            if (adjustedStateGroup.length === 0) {
                adjustedStateGroup = pendingStateGroup
            }

            adjustedStateGroup[adjustedStateGroup.length - 1].normalizeAngles()
            pendingStateGroup = adjustedStateGroup
        }

        this.simulation.frames.push(pendingStateGroup)
        pendingStateGroup = this.simulation.pendingStateGroup

        while (pendingStateGroup.length > 0) {
            pendingStateGroup.pop()
        }
    }

    doTimeStep(callStack) {
        const node = callStack[callStack.length - 1]

        if (node.recursionLevel > 32) {
            this.simulation.failed = true
        }

        if (this.simulation.failed) {
            while (callStack.length > 0) {
                callStack.pop()
            }

            return
        }

        const lastRecursionLevel = this.lastRecursionLevel

        if (node.recursionLevel < lastRecursionLevel) {
            let shouldDoSmallerTimeStep

            if (node.recursionLevel === lastRecursionLevel - 1) {
                const halfStreak = this.recursionLevelStreak >> 1

                if (halfStreak <= 2) {
                    shouldDoSmallerTimeStep = false
                } else if (halfStreak === 3) { // skipping every 1 of 2 attempts to double the time step
                    shouldDoSmallerTimeStep = true
                } else if (halfStreak === 4) {
                    shouldDoSmallerTimeStep = false
                } else if (halfStreak < 8) { // skipping every 3 of 4 attempts to double the time step
                    shouldDoSmallerTimeStep = true
                } else if (halfStreak === 8) {
                    shouldDoSmallerTimeStep = false
                } else { // skipping every 7 of 8 attempts to double the time step
                    shouldDoSmallerTimeStep = (halfStreak & 7) !== 0
                }
            } else { // not going any larger than twice the current step size
                shouldDoSmallerTimeStep = true
            }

            if (shouldDoSmallerTimeStep) {
                node.pushFirstHalf(callStack)
                this.doTimeStep(callStack)

                return
            }
        }

        const states = this.simulation.pendingStateGroup
        const lastState = states[states.length - 1]

        let { nextState, error } = this.createState(node.frameStart, node.frameEnd, lastState)
        let energyDifference = nextState.energy - this.energy

        if (error > this.maxError || Math.abs(energyDifference) > this.energyRange) {
            node.pushFirstHalf(callStack)
            return
        }

        function registerSuccess(selfRef) {
            states.push(nextState)

            if (node.recursionLevel === selfRef.lastRecursionLevel) {
                selfRef.recursionLevelStreak += 1
            } else {
                selfRef.lastRecursionLevel = node.recursionLevel
                selfRef.recursionLevelStreak = 1
            }

            callStack.pop()
        }

        let multiplier = 1
        let extremeDeviationCounter = 0
        const numPendulums = this.numPendulums

        const lastAngles = lastState.angles
        const lastMomenta = lastState.momenta

        const angleDifferences = []
        const momentumDifferences = []

        for (let i = 0; i < numPendulums; ++i) {
            angleDifferences.push(nextState.angles[i] - lastAngles[i])
            momentumDifferences.push(nextState.momenta[i] - lastMomenta[i])
        }

        const stateEquations = this.simulation.stateEquations

        for (let i = 0; i < 6; ++i) {
            if (i !== 0) {
                this.cachedForces = stateEquations
                    .solveAngularVelocitiesAndForces(nextState.angles, nextState.momenta).forces
            }

            let actionChange = 0

            for (let j = 0; j < numPendulums; ++j) {
                const nextMomentum = nextState.momenta[j]
                const momentumDifference = nextMomentum - lastMomenta[j]
                actionChange += momentumDifference * nextState.angularVelocities[j]

                const nextAngle = nextState.angles[j]
                const angleDifference = nextAngle - lastAngles[j]
                actionChange -= angleDifference * this.cachedForces[j]
            }

            multiplier *= 1 - energyDifference / actionChange

            if (multiplier > 1.05) {
                multiplier = 1.05
                extremeDeviationCounter += 1

            } else if (multiplier < 0.95) {
                multiplier = 0.95
                extremeDeviationCounter += 1

            } else {
                extremeDeviationCounter = 0
            }

            if (extremeDeviationCounter >= 3) {
                node.pushFirstHalf(callStack)
                return
            }

            for (let j = 0; j < numPendulums; ++j) {
                nextState.angles[j]  = angleDifferences[j] * multiplier + lastAngles[j]
                nextState.momenta[j] = momentumDifferences[j] * multiplier + lastMomenta[j]
            }

            stateEquations.process(nextState)
            energyDifference = nextState.energy - this.energy

            if (Math.abs(energyDifference) <= this.energyRange) {
                registerSuccess(this)
                return
            }
        }

        node.pushFirstHalf(callStack)
    }

    createState(frameStart, frameEnd, lastState) {
        const timeStep = (frameEnd - frameStart) / 60
        const numPendulums = this.numPendulums
        const stateEquations = this.simulation.stateEquations

        const angles = []
        const momenta = []

        for (let i = 0; i < numPendulums; ++i) {
            angles.push(0)
            momenta.push(0)
        }

        const angularVelocities = []
        const forces = []

        for (let i = 0; i < 6; ++i) {
            const rkdpCoefficients_i = this.rkdpCoefficients[i]

            for (let j = 0; j < i; ++j) {
                const ijValue = rkdpCoefficients_i[j]

                const angularVelocities_j = angularVelocities[j]
                const forces_j = forces[j]

                for (let k = 0; k < numPendulums; ++k) {
                    angles[k] += angularVelocities_j[k] * ijValue
                    momenta[k] += forces_j[k] * ijValue
                }
            }

            for (let j = 0; j < numPendulums; ++j) {
                angles[j] = angles[j] * timeStep + lastState.angles[j]
                momenta[j] = momenta[j] * timeStep + lastState.momenta[j]
            }

            const angularVelocitiesAndForces = stateEquations.solveAngularVelocitiesAndForces(angles, momenta)

            angularVelocities.push(angularVelocitiesAndForces.angularVelocities)
            forces.push(angularVelocitiesAndForces.forces)

            for (let i = 0; i < numPendulums; ++i) {
                angles[i] = 0
                momenta[i] = 0
            }
        }

        const altAngles = []
        const altMomenta = []

        for (let i = 0; i < numPendulums; ++i) {
            altAngles.push(0)
            altMomenta.push(0)
        }

        for (let i = 0; i < 6; ++i) {
            const weight = this.weights[i]
            const altWeight = this.altWeights[i]

            const angularVelocities_i = angularVelocities[i]
            const forces_i = forces[i]

            for (let j = 0; j < numPendulums; ++j) {
                const ijVelocity = angularVelocities_i[j]
                angles[j]    += ijVelocity * weight
                altAngles[j] += ijVelocity * altWeight

                const ijForce = forces_i[j]
                momenta[j]    += ijForce * weight
                altMomenta[j] += ijForce * altWeight
            }
        }

        const altWeight6 = this.altWeights[6]

        for (let i = 0; i < numPendulums; ++i) {
            const angle = angles[i]
            const momentum = momenta[i]

            const altAngle = angle * altWeight6 + altAngles[i]
            const altMomentum = momentum * altWeight6 + altMomenta[i]

            const lastAngle = lastState.angles[i]
            angles[i]    = angle * timeStep + lastAngle
            altAngles[i] = altAngle * timeStep + lastAngle

            const lastMomentum = lastState.momenta[i]
            momenta[i]    = momentum * timeStep + lastMomentum
            altMomenta[i] = altMomentum * timeStep + lastMomentum
        }

        // Create new states

        const altState = new PendulumState({
            frameProgress: frameEnd,
            angles:        altAngles,
            momenta:       altMomenta
        })

        stateEquations.process(altState)

        const nextState = new PendulumState({
            frameProgress: frameEnd,
            angles:        angles,
            momenta:       momenta
        })

        this.cachedForces = stateEquations.process(nextState, { returningForces: true })

        // Calculate position error

        let error = 0

        for (let i = 0; i < numPendulums; ++i) {
            const distanceX = altState.coordsX[i] - nextState.coordsX[i]
            const distanceY = altState.coordsY[i] - nextState.coordsY[i]

            error += Math.sqrt(distanceX * distanceX + distanceY * distanceY)
        }

        return { nextState: nextState, error: error }
    }
}
