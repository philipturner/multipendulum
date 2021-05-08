export class StateEquations {
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

    // The `matrix` is a system of linear of equations representing angular velocities
    // The derivative of each value in that matrix is used to calculate forces

    // Solving the `matrix` is has O(n^3) algorithmic complexity with respect to the number of pendulums
    // Solving the `matrix derivative` has O(n^4) algorithmic complexity

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

        // 3 characters before `Offset` means a variable represents a 3D coordinate
        // 4 characters before `Offset` means a variable represents a 4D coordinate

        // values in the matrix are addressed by a 3D coordinate
        // values in the matrix derivative are addressed by a 4D coordinate

        // an underscore means that a coordinate is set to zero
        // for example, `_abOffset` means the first coordinate is zero,
        // the second coordinate is the value of `a`,
        // and the third coordinate is the value of `b`

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

            // In variables declared below, a variable name ending with `Value` means it came from
            // the matrix, while a variable name ending with `Derivative` means it came from
            // the matrix derivative.

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
