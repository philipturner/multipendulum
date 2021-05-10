import { Simulation } from "./Simulation.js"

function mix(min, max, t) {
    return min * (1 - t) + max * t
}

export class SimulationPrototype {
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

    storedRandomLengths
    storedRandomMasses
    storedRandomAnglePercents
    storedRandomAngularVelocities

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
    changeCombinedLengthHandler

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

        this.doingLengthNormalization = true

        this.canvas = document.getElementById("canvas")
    }

    get simulation() {
        return new Simulation({
            numPendulums: this.numPendulums,
            gravitationalAcceleration: this.gravitationalAcceleration
        },
        {
            pendulumMasses: this._getMasses({ usingStoredRandom: true }),
            pendulumLengths: this._getLengths({ usingStoredRandom: true }),
            initialAngles: this._getInitialAnglesInRadians({ usingStoredRandom: true }),
            initialAngularVelocities: this._getInitialAngularVelocities({ usingStoredRandom: true })
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

        const lengths = this.lengths
        const angles = this.initialAnglesInRadians

        const lastJointAdjustment = windowSize / (windowSize + 10)
        const lengthMultiplier = (windowRadius / this.combinedPendulumLength) * lastJointAdjustment

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

    changeCombinedLength(newLength) {
        const changeCombinedLengthHandler = this.changeCombinedLengthHandler

        if (changeCombinedLengthHandler != null) {
            changeCombinedLengthHandler(newLength)
        }
    }

    get lengths() {
        return this._getLengths({
            usingStoredRandom: false
        })
    }

    _getLengths({ usingStoredRandom }) {
        const numPendulums = this.numPendulums
        let output

        if (!this.doingCustomLengths) {
            output = []
            let length

            if (this.doingLengthNormalization) {
                length = this.combinedPendulumLength / numPendulums
            } else {
                length = this.defaultLength
                this.changeCombinedLength(length * numPendulums)
            }

            for (let i = 0; i < numPendulums; ++i) {
                output.push(length)
            }
        } else {
            switch (this.customLengthType) {
                case "randomLengths":
                    if (usingStoredRandom) {
                        output = this.storedRandomLengths
                    } else {
                        output = this.randomLengths
                        this.storedRandomLengths = output
                    }

                    const defaultLength = this.defaultLength
                    output = output.map((a) => defaultLength * a)
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

            const combinedLength = output.reduce((a, b) => a + b, 0)

            if (this.doingLengthNormalization) {
                const multiplier = this.combinedPendulumLength / combinedLength
                output = output.map((a) => a * multiplier)
            } else {
                this.changeCombinedLength(combinedLength)
            }
        }

        return output
    }

    _getMasses({ usingStoredRandom }) {
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
                    let output

                    if (usingStoredRandom) {
                        output = this.storedRandomMasses
                    } else {
                        output = this.randomMasses
                        this.storedRandomMasses = output
                    }

                    const defaultMass = this.defaultMass
                    return output.map((a) => defaultMass * a)
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
        return this._getInitialAnglesInRadians({
            usingStoredRandom: false
        })
    }

    _getInitialAnglesInRadians({ usingStoredRandom }) {
        let output

        if (!this.doingCustomInitialAnglePercents) {
            output = []

            const numPendulums = this.numPendulums
            const initialAnglePercent = this.defaultAnglePercent

            for (let i = 0; i < numPendulums; ++i) {
                output.push(initialAnglePercent)
            }
        } else {
            switch (this.customAngleType) {
                case "randomAnglePercents":
                    if (usingStoredRandom) {
                        output = this.storedRandomAnglePercents
                    } else {
                        output = this.randomAnglePercents
                        this.storedRandomAnglePercents = output
                    }
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

    _getInitialAngularVelocities({ usingStoredRandom }) {
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
                    if (usingStoredRandom) {
                        return this.storedRandomAngularVelocities
                    } else {
                        const output = this.randomAngularVelocities
                        this.storedRandomAngularVelocities = output
                        return output
                    }
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
