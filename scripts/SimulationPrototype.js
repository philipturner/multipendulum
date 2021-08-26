import { Simulation } from "./Simulation.js"

function mix(min, max, t) {
    return (max - min) * t + min
}

export class SimulationPrototype {
    _numPendulums = 0

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

    _didInitialize_customLengths = false
    _didInitialize_customMasses = false
    _didInitialize_customAnglePercents = false
    _didInitialize_customAngularVelocities = false

    didUncheckLengthNormalization = false

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
    resetSimulationHandler

    canvas
    hiddenPropertyContainerArray
    loadedProperty

    constructor() {
        this.combinedPendulumLength = 0.5
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

        this.doingLengthNormalization = true

        this.canvas = document.getElementById("canvas")
        this.hiddenPropertyContainerArray = []
        this.loadedProperty = 0

        // 0: length
        // 1: mass
        // 2: angle
        // 3: angularVelocity

        this.numPendulums = 2
    }

    get simulation() {
        return new Simulation({
            numPendulums: this._numPendulums,
            gravitationalAcceleration: this.gravitationalAcceleration
        },
        {
            pendulumMasses: this._getMasses({ usingStoredRandom: true }),
            pendulumLengths: this._getLengths({ usingStoredRandom: true }),
            initialAngles: this._getInitialAnglesInRadians({ usingStoredRandom: true }),
            initialAngularVelocities: this._getInitialAngularVelocities({ usingStoredRandom: true })
        })
    }

    get numPendulums() { return this._numPendulums }
    set numPendulums(rawNewValue) {
        const newValue = Math.min(Math.max(1, rawNewValue), 1024)
        const previousNumPendulums = this.numPendulums

        if (previousNumPendulums < newValue) {
            const customPropertyBox = document.getElementById("custom-property-box")
            const numPropertyContainers = this.hiddenPropertyContainerArray.length

            for (let i = previousNumPendulums; i < newValue; ++i) {
                this._customLengthArray.push(this.defaultLength)
                this._customMassArray.push(this.defaultMass)
                this._customAnglePercentArray.push(this.defaultAnglePercent)
                this._customAngularVelocityArray.push(this.defaultAngularVelocity)

                if (i >= numPropertyContainers) {
                    const i_plus_1 = i + 1

                    const container_id = `pendulum-${i_plus_1}-container`
                    const input_id = `pendulum-${i_plus_1}-input`

                    const newElementStr = `
                    <div id="${container_id}">
                        <p class="options-text"><label for="${input_id}">Pendulum ${i_plus_1}</label></p>
                        <input class="options-input-text" type="number" id="${input_id}">
                    </div>`

                    customPropertyBox.innerHTML += newElementStr

                    this.hiddenPropertyContainerArray.push(false)
                } else {
                    if (this.hiddenPropertyContainerArray[i]) {
                        this.hiddenPropertyContainerArray[i] = false

                        document.getElementById(`pendulum-${i + 1}-container`).hidden = false
                    }
                }
            }

            let propertyArray

            switch (this.loadedProperty) {
                case 0:
                    propertyArray = this._customLengthArray
                    break
                case 1:
                    propertyArray = this._customMassArray
                    break
                case 2:
                    propertyArray = this._customAnglePercentArray.map((a) => a * 1.8)
                    break
                case 3:
                    propertyArray = this._customAngularVelocityArray.map((a) => a / (2 * Math.PI))
                    break
                default:
                    throw "Incorrect loaded property ID"
            }

            const selfRef = this

            for (let i = 0; i < newValue; ++i) {
                const input_id = `pendulum-${i + 1}-input`
                const inputElement = document.getElementById(input_id)

                inputElement.value = propertyArray[i]

                inputElement.onchange = () => {
                    selfRef.setPropertyElement(i, inputElement, Number(inputElement.value))
                }
            }
        }

        for (let i = 0; i < newValue; ++i) {
            if (this.hiddenPropertyContainerArray[i]) {
                this.hiddenPropertyContainerArray[i] = false

                document.getElementById(`pendulum-${i + 1}-container`).hidden = false
            }
        }

        const numPropertyContainers = this.hiddenPropertyContainerArray.length

        for (let i = newValue; i < numPropertyContainers; ++i) {
            if (!this.hiddenPropertyContainerArray[i]) {
                this.hiddenPropertyContainerArray[i] = true

                document.getElementById(`pendulum-${i + 1}-container`).hidden = true
            }
        }

        this._numPendulums = newValue
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

    setLoadedProperty(propertyID, { bypass } = { bypass: false }) {
        if (this.loadedProperty === propertyID && !bypass) {
            return
        } else {
            this.loadedProperty = propertyID
        }

        let propertyArray

        switch (propertyID) {
            case 0:
                propertyArray = this._customLengthArray
                break
            case 1:
                propertyArray = this._customMassArray
                break
            case 2:
                propertyArray = this._customAnglePercentArray.map((a) => a * 1.8)
                break
            case 3:
                propertyArray = this._customAngularVelocityArray.map((a) => a / (2 * Math.PI))
                break
            default:
                throw "Incorrect loaded property ID"
        }

        const propertyElementCount = this.hiddenPropertyContainerArray.length

        for (let i = 0; i < propertyElementCount; ++i) {
            const element = document.getElementById(`pendulum-${i + 1}-input`)

            element.value = propertyArray[i]
        }
    }

    setAllToDefault() {
        const propertyID = this.loadedProperty

        switch (propertyID) {
            case 0:
                this._customLengthArray =
                    this._customLengthArray.map(() => this.defaultLength)
                this.combinedPendulumLength = this.defaultLength * this.numPendulums
                break
            case 1:
                this._customMassArray =
                    this._customMassArray.map(() => this.defaultMass)
                break
            case 2:
                this._customAnglePercentArray =
                    this._customAnglePercentArray.map(() => this.defaultAnglePercent)
                break
            case 3:
                this._customAngularVelocityArray =
                    this._customAngularVelocityArray.map(() => this.defaultAngularVelocity)
                break
            default:
                throw "Incorrect loaded property ID"
        }

        this.setLoadedProperty(propertyID, { bypass: true })
    }

    setPropertyElement(arrayIndex, element, rawNewValue) {
        let newValue

        if (rawNewValue === "") {
            newValue = 1
            element.value = 1
        } else {
            newValue = rawNewValue
        }

        switch (this.loadedProperty) {
            case 0:
                this._customLengthArray[arrayIndex] = newValue
                break
            case 1:
                this._customMassArray[arrayIndex] = newValue
                break
            case 2:
                this._customAnglePercentArray[arrayIndex] = newValue / 1.8
                break
            case 3:
                this._customAngularVelocityArray[arrayIndex] = newValue * (2 * Math.PI)
                break
            default:
                throw "Incorrect loaded property ID"
        }

        this.resetSimulationHandler()
    }

    ensureCustomLengthsInitialized() {
        if (this._didInitialize_customLengths) {
            return
        }

        this._didInitialize_customLengths = true

        let defaultLength

        if (!this.didUncheckLengthNormalization) {
            defaultLength = Number((this.combinedPendulumLength / this.numPendulums).toFixed(4))
            this.defaultLength = defaultLength
        } else {
            defaultLength = this.defaultLength
        }

        const propertyID_isLengths = this.loadedProperty === 0
        const customLengths = this._customLengthArray

        const propertyElementCount = this.hiddenPropertyContainerArray.length

        for (let i = 0; i < propertyElementCount; ++i) {
            customLengths[i] = defaultLength

            if (propertyID_isLengths) {
                const input_id = `pendulum-${i + 1}-input`
                const inputElement = document.getElementById(input_id)

                inputElement.value = defaultLength
            }
        }
    }

    ensureCustomMassesInitialized() {
        if (this._didInitialize_customMasses) {
            return
        }

        this._didInitialize_customMasses = true

        const defaultMass = this.defaultMass

        const propertyID_isMasses = this.loadedProperty === 1
        const customMasses = this._customMassArray

        const propertyElementCount = this.hiddenPropertyContainerArray.length

        for (let i = 0; i < propertyElementCount; ++i) {
            customMasses[i] = defaultMass

            if (propertyID_isMasses) {
                const input_id = `pendulum-${i + 1}-input`
                const inputElement = document.getElementById(input_id)

                inputElement.value = defaultMass
            }
        }
    }

    ensureCustomAnglePercentsInitialized() {
        if (this._didInitialize_customAnglePercents) {
            return
        }

        this._didInitialize_customAnglePercents = true

        const defaultAnglePercent = this.defaultAnglePercent
        const defaultAngleDegrees = Number((defaultAnglePercent * 1.8).toFixed(4))

        const propertyID_isAnglePercents = this.loadedProperty === 2
        const customAnglePercents = this._customAnglePercentArray

        const propertyElementCount = this.hiddenPropertyContainerArray.length

        for (let i = 0; i < propertyElementCount; ++i) {
            customAnglePercents[i] = defaultAnglePercent

            if (propertyID_isAnglePercents) {
                const input_id = `pendulum-${i + 1}-input`
                const inputElement = document.getElementById(input_id)

                inputElement.value = defaultAngleDegrees
            }
        }
    }

    ensureCustomAngularVelocitiesInitialized() {
        if (this._didInitialize_customAngularVelocities) {
            return
        }

        this._didInitialize_customAngularVelocities = true

        const defaultAngularVelocity = this.defaultAngularVelocity
        let defaultAngularVelocityHz = defaultAngularVelocity / (2 * Math.PI)
        defaultAngularVelocityHz = Number(defaultAngularVelocityHz.toFixed(4))

        const propertyID_isAngularVelocities = this.loadedProperty === 3
        const customAngularVelocities = this._customAngularVelocityArray

        const propertyElementCount = this.hiddenPropertyContainerArray.length

        for (let i = 0; i < propertyElementCount; ++i) {
            customAngularVelocities[i] = defaultAngularVelocity

            if (propertyID_isAngularVelocities) {
                const input_id = `pendulum-${i + 1}-input`
                const inputElement = document.getElementById(input_id)

                inputElement.value = defaultAngularVelocityHz
            }
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
                    if (usingStoredRandom && (this.storedRandomLengths != null) && (this.storedRandomLengths.length === numPendulums)) {
                        output = this.storedRandomLengths
                    } else {
                        output = this.randomLengths
                        this.storedRandomLengths = output
                    }
                    
                    break
                case "endIsLongerLengths":
                    output = this.endIsLongerLengths
                    break
                case "endIsShorterLengths":
                    output = this.endIsShorterLengths
                    break
                case "customLengths":
                    output = this.customLengthArray
                    break
                default:
                    throw "Incorrect custom length type"
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

                    if (usingStoredRandom && (this.storedRandomMasses != null) && (this.storedRandomMasses.length === numPendulums)) {
                        output = this.storedRandomMasses
                    } else {
                        output = this.randomMasses
                        this.storedRandomMasses = output
                    }
                    
                    return output
                case "endIsHeavierMasses":
                    return this.endIsHeavierMasses
                case "endIsLighterMasses":
                    return this.endIsLighterMasses
                case "customMasses":
                    return this.customMassArray
                default:
                    throw "Incorrect custom mass type"
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
                    if (usingStoredRandom && (this.storedRandomAnglePercents != null) && (this.storedRandomAnglePercents.length === numPendulums)) {
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
                case "customAnglePercents":
                    output = this.customAnglePercentArray
                    break
                default:
                    throw "Incorrect custom angle type"
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
                    if (usingStoredRandom && (this.storedRandomAngularVelocities != null) && (this.storedRandomAngularVelocities.length === numPendulums)) {
                        return this.storedRandomAngularVelocities
                    } else {
                        const output = this.randomAngularVelocities
                        this.storedRandomAngularVelocities = output
                        return output
                    }
                case "customAngularVelocities":
                    return this.customAngularVelocityArray
                default:
                    throw "Incorrect custom angular velocity type"
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
        const output = []
        
        const numPendulums = this.numPendulums
        
        if (numPendulums === 1) {
            output.push(51)
            return output
        }

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
