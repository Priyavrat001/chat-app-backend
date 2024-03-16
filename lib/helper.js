export const getOtherMembers = (allMembers, userId) => {
    allMembers.find((member) => member._id.toString() !== userId.toString());
}