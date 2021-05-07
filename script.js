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

